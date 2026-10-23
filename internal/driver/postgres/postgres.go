// SPDX-License-Identifier: GPL-3.0-only

// Package postgres implements the DatabaseDriver port for PostgreSQL.
package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"

	"zentro/internal/driver"
	"zentro/internal/driver/tlsopt"
	"zentro/internal/models"
	"zentro/internal/sshtunnel"
)

// PostgresDriver is the Adapter for PostgreSQL.
type PostgresDriver struct {
	dial driver.DialProvider
}

// New returns a new PostgresDriver.
func New() *PostgresDriver {
	return &PostgresDriver{}
}

// WithDialProvider routes this driver's connections through the dialers the
// provider hands out (SSH tunnel, traffic metering); nil keeps direct dialing.
func (d *PostgresDriver) WithDialProvider(dp driver.DialProvider) *PostgresDriver {
	d.dial = dp
	return d
}

func (d *PostgresDriver) Name() string { return "postgres" }

// buildConfig parses the profile into a pgx config and applies the profile's
// TLS options to the primary config and to every fallback (sslmode=prefer
// yields a TLS attempt plus a plaintext one).
func buildConfig(p *models.ConnectionProfile) (*pgx.ConnConfig, error) {
	userInfo := url.UserPassword(p.Username, p.Password).String()
	dsn := fmt.Sprintf(
		"postgres://%s@%s:%d/%s?sslmode=%s&connect_timeout=%d",
		userInfo, p.Host, p.Port, p.DBName, p.SSLMode, p.ConnectTimeout,
	)
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	if err := tlsopt.Apply(cfg.TLSConfig, p); err != nil {
		return nil, err
	}
	for _, fb := range cfg.Fallbacks {
		if err := tlsopt.Apply(fb.TLSConfig, p); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}

// Open builds the connection config and opens a *sql.DB with sensible pool defaults.
func (d *PostgresDriver) Open(p *models.ConnectionProfile) (*sql.DB, error) {
	maskedUserInfo := url.UserPassword(p.Username, "***").String()
	masked := fmt.Sprintf(
		"postgres://%s@%s:%d/%s?sslmode=%s&connect_timeout=%d",
		maskedUserInfo, p.Host, p.Port, p.DBName, p.SSLMode, p.ConnectTimeout,
	)
	slog.Info("postgres: open", "dsn", masked)

	cfg, err := buildConfig(p)
	if err != nil {
		return nil, fmt.Errorf("postgres: open: %w", err)
	}
	if dial := d.dial.DialerFor(p); dial != nil {
		cfg.DialFunc = pgconn.DialFunc(dial)
		// pgx resolves the host before dialing; behind a tunnel the name only
		// means something to the far side, so hand it through untouched.
		cfg.LookupFunc = func(_ context.Context, host string) ([]string, error) {
			return []string{host}, nil
		}
	}
	db := stdlib.OpenDB(*cfg)
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	return db, nil
}

// FriendlyError maps raw PostgreSQL errors to user-readable messages.
func (d *PostgresDriver) FriendlyError(err error) error {
	if err == nil {
		return nil
	}
	if explained := sshtunnel.Explain(err); explained != nil {
		return explained
	}
	if explained := tlsopt.Explain(err); explained != nil {
		return explained
	}
	msg := strings.ToLower(err.Error())
	switch {
	case containsAny(msg, "authentication failed", "password authentication failed"):
		return fmt.Errorf("authentication failed - check username and password")
	case containsAny(msg, "connection refused"):
		return fmt.Errorf("connection refused - check host and port")
	case containsAny(msg, "no such host", "name resolution"):
		return fmt.Errorf("host not found - check the hostname")
	case containsAny(msg, "context deadline exceeded", "timeout"):
		return fmt.Errorf("connection timed out - check host/port or firewall rules")
	case containsAny(msg, "permission denied to create database", "must be owner", "must be superuser"):
		return fmt.Errorf("you don't have permission to create databases on this server")
	case containsAny(msg, "already exists"):
		return fmt.Errorf("a database with that name already exists")
	case containsAny(msg, "database", "does not exist"):
		return fmt.Errorf("database not found - check the database name")
	default:
		return fmt.Errorf("postgres: %s", err.Error())
	}
}

// CreateDatabase creates a new database on the server via CREATE DATABASE.
// Must be run against a bootstrap connection (e.g. the "postgres" database),
// not the pooled connection for a specific target database.
func (d *PostgresDriver) CreateDatabase(ctx context.Context, db *sql.DB, name string) error {
	quoted := `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
	_, err := db.ExecContext(ctx, "CREATE DATABASE "+quoted)
	return err
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func (d *PostgresDriver) DefaultSchema() string { return "public" }

// QuoteIdentifier double-quotes a name, doubling any embedded double quote.
func (d *PostgresDriver) QuoteIdentifier(name string) string {
	return quotePostgresIdentifier(name)
}

// CountReferencingRows counts child rows matching the given keys ($n bind markers).
func (d *PostgresDriver) CountReferencingRows(ctx context.Context, db *sql.DB, schema, table string, columns []string, keys [][]string, limit int) (int64, bool, error) {
	return driver.CountReferencingRowsWith(ctx, db, d, func(n int) string { return fmt.Sprintf("$%d", n) }, schema, table, columns, keys, limit)
}

// SupportsSessionSchema reports that Postgres has session-level schema
// context (search_path) that must be pinned to one connection.
func (d *PostgresDriver) SupportsSessionSchema() bool { return true }

// ApplySchemaContext sets the Postgres search_path for the current session.
// Called before each query when the user has selected a non-default schema.
func (d *PostgresDriver) ApplySchemaContext(ctx context.Context, exec driver.ContextExecutor, schema string) error {
	if schema == "" {
		return nil
	}
	searchPath := `"` + strings.ReplaceAll(schema, `"`, `""`) + `"`
	if !strings.EqualFold(schema, "public") {
		searchPath += `, "public"`
	}
	_, err := exec.ExecContext(ctx, "SET search_path TO "+searchPath)
	return err
}

// ResetSchemaContext restores the session search_path to its default.
func (d *PostgresDriver) ResetSchemaContext(ctx context.Context, exec driver.ContextExecutor) error {
	_, err := exec.ExecContext(ctx, "RESET search_path")
	return err
}

// MaintenanceDBName returns the built-in "postgres" database, which always
// exists and is the conventional target for server-level operations.
func (d *PostgresDriver) MaintenanceDBName() (string, error) { return "postgres", nil }

func (d *PostgresDriver) InjectPageClause(query string, limit, offset int) string {
	limitPattern := regexp.MustCompile(`(?i)\bLIMIT\b|\bOFFSET\b|\bTOP\b|\bFETCH\b`)
	if limitPattern.MatchString(query) {
		return query
	}

	trimmed := strings.TrimSpace(query)
	if offset > 0 {
		return trimmed + fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
	}
	return trimmed + fmt.Sprintf(" LIMIT %d", limit)
}
