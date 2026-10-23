// SPDX-License-Identifier: GPL-3.0-only

// Package mssql implements the DatabaseDriver port for Microsoft SQL Server.
package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	mssql "github.com/microsoft/go-mssqldb"
	"github.com/microsoft/go-mssqldb/msdsn"

	"zentro/internal/driver"
	"zentro/internal/driver/tlsopt"
	"zentro/internal/models"
	"zentro/internal/sshtunnel"
)

// MSSQLDriver is the Adapter for Microsoft SQL Server.
type MSSQLDriver struct {
	dial driver.DialProvider
}

// New returns a new MSSQLDriver as a concrete value.
func New() *MSSQLDriver {
	return &MSSQLDriver{}
}

// WithDialProvider routes this driver's connections through the dialers the
// provider hands out (SSH tunnel, traffic metering); nil keeps direct dialing.
func (d *MSSQLDriver) WithDialProvider(dp driver.DialProvider) *MSSQLDriver {
	d.dial = dp
	return d
}

// hostDialer marks a custom dialer as proxying into another network, so
// go-mssqldb leaves the host name for the far side to resolve instead of
// looking it up locally (an internal name behind an SSH server would not
// resolve here).
type hostDialer struct {
	driver.DialFunc
	host string
}

func (h hostDialer) HostName() string { return h.host }

func (d *MSSQLDriver) Name() string { return "sqlserver" }

// buildConfig parses the profile into a go-mssqldb config and applies the
// profile's TLS options. TLS 1.0 stays the floor unless the profile sets one,
// so old servers keep working without any extra setup.
func buildConfig(p *models.ConnectionProfile) (msdsn.Config, error) {
	userInfo := url.UserPassword(p.Username, p.Password).String()
	tlsMin := "1.0"
	if p.TLSMinVersion != "" {
		tlsMin = p.TLSMinVersion
	}
	dsn := fmt.Sprintf(
		"sqlserver://%s@%s:%d?database=%s&connection+timeout=%d&tlsmin=%s",
		userInfo, p.Host, p.Port, p.DBName, p.ConnectTimeout, url.QueryEscape(tlsMin),
	)
	if p.TrustServerCert {
		dsn += "&TrustServerCertificate=true"
	}

	cfg, err := msdsn.Parse(dsn)
	if err != nil {
		return msdsn.Config{}, err
	}
	if err := tlsopt.Apply(cfg.TLSConfig, p); err != nil {
		return msdsn.Config{}, err
	}
	return cfg, nil
}

// Open builds the connection config and opens a *sql.DB for SQL Server.
func (d *MSSQLDriver) Open(p *models.ConnectionProfile) (*sql.DB, error) {
	cfg, err := buildConfig(p)
	if err != nil {
		return nil, fmt.Errorf("mssql: open: %w", err)
	}

	connector := mssql.NewConnectorConfig(cfg)
	if dial := d.dial.DialerFor(p); dial != nil {
		connector.Dialer = hostDialer{DialFunc: dial, host: p.Host}
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	return db, nil
}

// FriendlyError maps raw SQL Server errors to user-readable messages.
func (d *MSSQLDriver) FriendlyError(err error) error {
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
	case containsAny(msg, "create database permission denied", "permission was denied"):
		return fmt.Errorf("you don't have permission to create databases on this server")
	case containsAny(msg, "already exists"):
		return fmt.Errorf("a database with that name already exists")
	case containsAny(msg, "login failed"):
		return fmt.Errorf("authentication failed - check username and password")
	case containsAny(msg, "connection refused"):
		return fmt.Errorf("connection refused - check host and port")
	case containsAny(msg, "no such host", "name resolution"):
		return fmt.Errorf("host not found - check the hostname")
	case containsAny(msg, "context deadline exceeded", "timeout"):
		return fmt.Errorf("connection timed out - check host/port or firewall rules")
	case containsAny(msg, "cannot open database"):
		return fmt.Errorf("database not found - check the database name")
	default:
		return fmt.Errorf("sql server: %s", err.Error())
	}
}

// CreateDatabase creates a new database on the server via CREATE DATABASE.
func (d *MSSQLDriver) CreateDatabase(ctx context.Context, db *sql.DB, name string) error {
	escaped := strings.ReplaceAll(name, "]", "]]")
	_, err := db.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE [%s]", escaped))
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

func (d *MSSQLDriver) DefaultSchema() string { return "dbo" }

// QuoteIdentifier double-quotes a name, doubling any embedded double quote.
func (d *MSSQLDriver) QuoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// CountReferencingRows counts child rows matching the given keys (@pN bind markers).
func (d *MSSQLDriver) CountReferencingRows(ctx context.Context, db *sql.DB, schema, table string, columns []string, keys [][]string, limit int) (int64, bool, error) {
	return driver.CountReferencingRowsWith(ctx, db, d, func(n int) string { return fmt.Sprintf("@p%d", n) }, schema, table, columns, keys, limit)
}

func (d *MSSQLDriver) SupportsSessionSchema() bool { return false }

func (d *MSSQLDriver) ApplySchemaContext(_ context.Context, _ driver.ContextExecutor, _ string) error {
	return nil
}

func (d *MSSQLDriver) ResetSchemaContext(_ context.Context, _ driver.ContextExecutor) error {
	return nil
}

// MaintenanceDBName returns the built-in "master" database, which always
// exists and is the conventional target for server-level operations.
func (d *MSSQLDriver) MaintenanceDBName() (string, error) { return "master", nil }

func (d *MSSQLDriver) InjectPageClause(query string, limit, offset int) string {
	limitPattern := regexp.MustCompile(`(?i)\bLIMIT\b|\bOFFSET\b|\bTOP\b|\bFETCH\b`)
	if limitPattern.MatchString(query) {
		return query
	}

	// Strip trailing semicolons so they don't end up between the query and the
	// OFFSET/FETCH clause. SQL Server would then parse FETCH as cursor syntax
	// rather than OFFSET-FETCH, producing "Invalid usage of the option NEXT".
	trimmed := strings.TrimRight(strings.TrimSpace(query), ";")
	hasOrderBy := regexp.MustCompile(`(?i)\bORDER\s+BY\b`).MatchString(trimmed)
	if !hasOrderBy {
		// ORDER BY (SELECT NULL) is the recommended SQL Server idiom for
		// "any order is fine". Column ordinals (ORDER BY 1) are unreliable
		// with OFFSET-FETCH across SQL Server versions and are deprecated.
		trimmed = trimmed + " ORDER BY (SELECT NULL)"
	}
	return trimmed + fmt.Sprintf(" OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", offset, limit)
}
