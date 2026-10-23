// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"crypto/tls"
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"regexp"
	"strings"
	"time"

	mysqldrv "github.com/go-sql-driver/mysql"

	"zentro/internal/driver"
	"zentro/internal/driver/tlsopt"
	"zentro/internal/models"
	"zentro/internal/sshtunnel"
)

type MySQLDriver struct {
	dial driver.DialProvider
}

func New() *MySQLDriver {
	return &MySQLDriver{}
}

// WithDialProvider routes this driver's connections through the dialers the
// provider hands out (SSH tunnel, traffic metering); nil keeps direct dialing.
func (d *MySQLDriver) WithDialProvider(dp driver.DialProvider) *MySQLDriver {
	d.dial = dp
	return d
}

func (d *MySQLDriver) Name() string { return "mysql" }

// tlsConfigFor maps the profile's SSL mode to a TLS config; nil means plaintext.
// "require" encrypts without verifying the server (like libpq's require);
// "verify-ca" and "verify-full" both verify the chain and host name against
// the system roots, which is the stricter of the two.
func tlsConfigFor(p *models.ConnectionProfile) (*tls.Config, error) {
	var cfg *tls.Config
	switch strings.ToLower(strings.TrimSpace(p.SSLMode)) {
	case "", "disable":
		return nil, nil
	case "require":
		cfg = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // "require" means encrypt only, by user choice
	case "verify-ca", "verify-full":
		cfg = &tls.Config{ServerName: p.Host}
	default:
		return nil, fmt.Errorf("unsupported SSL mode %q", p.SSLMode)
	}
	if err := tlsopt.Apply(cfg, p); err != nil {
		return nil, err
	}
	return cfg, nil
}

// buildConfig parses the profile into a go-sql-driver config, attaching TLS
// when the SSL mode asks for it.
func buildConfig(p *models.ConnectionProfile) (*mysqldrv.Config, error) {
	// DSN format: user:password@tcp(host:port)/dbname
	userInfo := url.UserPassword(p.Username, p.Password).String()
	dsn := fmt.Sprintf("%s@tcp(%s:%d)/%s?parseTime=true", userInfo, p.Host, p.Port, p.DBName)
	cfg, err := mysqldrv.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}
	tlsCfg, err := tlsConfigFor(p)
	if err != nil {
		return nil, err
	}
	cfg.TLS = tlsCfg
	return cfg, nil
}

func (d *MySQLDriver) Open(p *models.ConnectionProfile) (*sql.DB, error) {
	cfg, err := buildConfig(p)
	if err != nil {
		return nil, err
	}
	if dial := d.dial.DialerFor(p); dial != nil {
		cfg.DialFunc = dial
	}
	connector, err := mysqldrv.NewConnector(cfg)
	if err != nil {
		return nil, err
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	return db, nil
}

func (d *MySQLDriver) FriendlyError(err error) error {
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
	case strings.Contains(msg, "access denied") && strings.Contains(msg, "create"):
		return fmt.Errorf("you don't have permission to create databases on this server")
	case strings.Contains(msg, "database exists"):
		return fmt.Errorf("a database with that name already exists")
	case strings.Contains(msg, "access denied"):
		return fmt.Errorf("authentication failed - check username and password")
	case strings.Contains(msg, "connection refused"):
		return fmt.Errorf("connection refused - check host and port")
	case strings.Contains(msg, "no such host") || strings.Contains(msg, "name resolution"):
		return fmt.Errorf("host not found - check the hostname")
	case strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "timeout"):
		return fmt.Errorf("connection timed out - check host/port or firewall rules")
	case strings.Contains(msg, "unknown database"):
		return fmt.Errorf("database not found - check the database name")
	default:
		return fmt.Errorf("mysql: %s", err.Error())
	}
}

// CreateDatabase creates a new database on the server via CREATE DATABASE.
func (d *MySQLDriver) CreateDatabase(ctx context.Context, db *sql.DB, name string) error {
	escaped := strings.ReplaceAll(name, "`", "``")
	_, err := db.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE `%s`", escaped))
	return err
}

func (d *MySQLDriver) FetchDatabases(ctx context.Context, db *sql.DB, currentDB string, showAllSchemas bool, logger *slog.Logger) ([]*models.DatabaseInfo, error) {
	rows, err := db.QueryContext(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var infos []*models.DatabaseInfo
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			info := &models.DatabaseInfo{Name: name}
			if name == currentDB {
				schemas, err := d.FetchSchema(ctx, db, showAllSchemas, logger)
				if err == nil {
					info.Schemas = schemas
				}
			}
			infos = append(infos, info)
		}
	}
	return infos, nil
}

func (d *MySQLDriver) FetchSchema(ctx context.Context, db *sql.DB, showAllSchemas bool, logger *slog.Logger) ([]*models.SchemaNode, error) {
	node := models.NewSchemaNode("") // In MySQL, schema = database
	rows, err := db.QueryContext(ctx, "SHOW FULL TABLES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var name, tableType string
		if rows.Scan(&name, &tableType) == nil {
			if tableType == "VIEW" {
				node.Views = append(node.Views, name)
			} else {
				node.Tables = append(node.Tables, name)
			}
		}
	}
	return []*models.SchemaNode{node}, nil
}

func (d *MySQLDriver) FetchTablePrimaryKeys(ctx context.Context, db *sql.DB, schema, table string) ([]string, error) {
	query := `
		SELECT COLUMN_NAME
		FROM information_schema.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
	`
	rows, err := db.QueryContext(ctx, query, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pks []string
	for rows.Next() {
		var col string
		if rows.Scan(&col) == nil {
			pks = append(pks, col)
		}
	}
	return pks, nil
}

func (d *MySQLDriver) DefaultSchema() string { return "" }

// QuoteIdentifier backtick-quotes a name, doubling any embedded backtick.
func (d *MySQLDriver) QuoteIdentifier(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

// CountReferencingRows counts child rows matching the given keys (? bind markers).
func (d *MySQLDriver) CountReferencingRows(ctx context.Context, db *sql.DB, schema, table string, columns []string, keys [][]string, limit int) (int64, bool, error) {
	return driver.CountReferencingRowsWith(ctx, db, d, func(int) string { return "?" }, schema, table, columns, keys, limit)
}

func (d *MySQLDriver) SupportsSessionSchema() bool { return false }

func (d *MySQLDriver) ApplySchemaContext(_ context.Context, _ driver.ContextExecutor, _ string) error {
	return nil
}

func (d *MySQLDriver) ResetSchemaContext(_ context.Context, _ driver.ContextExecutor) error {
	return nil
}

// MaintenanceDBName returns "" — MySQL allows connecting without selecting a
// database, which is what server-level operations need.
func (d *MySQLDriver) MaintenanceDBName() (string, error) { return "", nil }

func (d *MySQLDriver) InjectPageClause(query string, limit, offset int) string {
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

func (d *MySQLDriver) FetchTableColumns(ctx context.Context, db *sql.DB, schema, table string) ([]*models.ColumnDef, error) {
	query := `
		SELECT
			COLUMN_NAME,
			COLUMN_TYPE,
			DATA_TYPE,
			IS_NULLABLE,
			COLUMN_KEY,
			COALESCE(COLUMN_DEFAULT, ''),
			COALESCE(COLUMN_COMMENT, '')
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION;
	`
	rows, err := db.QueryContext(ctx, query, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: fetch columns: %w", err)
	}
	defer rows.Close()

	var cols []*models.ColumnDef
	for rows.Next() {
		var colName, columnType, dataType, isNullable, columnKey, defVal, comment string
		if err := rows.Scan(&colName, &columnType, &dataType, &isNullable, &columnKey, &defVal, &comment); err != nil {
			return nil, err
		}
		cols = append(cols, &models.ColumnDef{
			Name:         colName,
			DataType:     dataType,
			FullDataType: columnType, // COLUMN_TYPE includes length/params e.g. varchar(255)
			Description:  comment,
			DefaultValue: defVal,
			IsNullable:   strings.ToUpper(isNullable) == "YES",
			IsPrimaryKey: strings.ToUpper(columnKey) == "PRI",
		})
	}
	return cols, nil
}

// AlterTableColumn applies column changes using MySQL DDL.
// MySQL supports ALTER TABLE MODIFY COLUMN for type+nullability and CHANGE for rename.
func (d *MySQLDriver) AlterTableColumn(ctx context.Context, db *sql.DB, schema, table string, old, updated *models.ColumnDef) error {
	// 1. Rename + retype in one statement (CHANGE COLUMN)
	if old.Name != updated.Name || old.DataType != updated.DataType || old.IsNullable != updated.IsNullable {
		nullStr := "NOT NULL"
		if updated.IsNullable {
			nullStr = "NULL"
		}
		defStr := ""
		if updated.DefaultValue != "" {
			defStr = fmt.Sprintf(" DEFAULT %s", updated.DefaultValue)
		}
		sql := fmt.Sprintf(
			"ALTER TABLE `%s` CHANGE COLUMN `%s` `%s` %s %s%s",
			table, old.Name, updated.Name, updated.DataType, nullStr, defStr,
		)
		if _, err := db.ExecContext(ctx, sql); err != nil {
			return fmt.Errorf("mysql: alter column: %w", err)
		}
	}
	return nil
}

// AddTableColumn implements driver.SchemaFetcher.
func (d *MySQLDriver) AddTableColumn(ctx context.Context, db *sql.DB, schema, table string, col *models.ColumnDef) error {
	nullability := "NULL"
	if !col.IsNullable {
		nullability = "NOT NULL"
	}

	defaultValue := ""
	if col.DefaultValue != "" {
		defaultValue = " DEFAULT " + col.DefaultValue
	}

	pkStr := ""
	if col.IsPrimaryKey {
		pkStr = " PRIMARY KEY"
	}

	sqlStr := fmt.Sprintf(
		"ALTER TABLE `%s` ADD COLUMN `%s` %s %s%s%s",
		table, col.Name, col.DataType, nullability, defaultValue, pkStr,
	)

	if _, err := db.ExecContext(ctx, sqlStr); err != nil {
		return fmt.Errorf("mysql: add column: %w", err)
	}
	return nil
}

// FetchTableRelationships implements driver.SchemaFetcher.
func (d *MySQLDriver) FetchTableRelationships(ctx context.Context, db *sql.DB, schema, table string) ([]models.TableRelationship, error) {
	query := `
		SELECT
			kcu.CONSTRAINT_NAME AS ConstraintName,
			kcu.TABLE_SCHEMA AS SourceSchema,
			kcu.TABLE_NAME AS SourceTable,
			kcu.COLUMN_NAME AS SourceColumn,
			kcu.REFERENCED_TABLE_SCHEMA AS TargetSchema,
			kcu.REFERENCED_TABLE_NAME AS TargetTable,
			kcu.REFERENCED_COLUMN_NAME AS TargetColumn,
			rc.DELETE_RULE AS OnDelete,
			rc.UPDATE_RULE AS OnUpdate
		FROM information_schema.KEY_COLUMN_USAGE kcu
		JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
			ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
			AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
		WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL
			AND (
				(kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?)
				OR
				(kcu.REFERENCED_TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME = ?)
			)
	`
	rows, err := db.QueryContext(ctx, query, schema, table, schema, table)
	if err != nil {
		return nil, fmt.Errorf("mysql: fetch relationships: %w", err)
	}
	defer rows.Close()

	var rels []models.TableRelationship
	for rows.Next() {
		var r models.TableRelationship
		if err := rows.Scan(
			&r.ConstraintName,
			&r.SourceSchema,
			&r.SourceTable,
			&r.SourceColumn,
			&r.TargetSchema,
			&r.TargetTable,
			&r.TargetColumn,
			&r.OnDelete,
			&r.OnUpdate,
		); err != nil {
			return nil, fmt.Errorf("mysql: scan relationship: %w", err)
		}
		r.OnDelete = strings.ReplaceAll(strings.ToUpper(strings.TrimSpace(r.OnDelete)), "_", " ")
		r.OnUpdate = strings.ReplaceAll(strings.ToUpper(strings.TrimSpace(r.OnUpdate)), "_", " ")
		rels = append(rels, r)
	}
	return rels, rows.Err()
}

// DropTableColumn implements driver.SchemaFetcher.
func (d *MySQLDriver) DropTableColumn(ctx context.Context, db *sql.DB, schema, table, column string) error {
	query := fmt.Sprintf("ALTER TABLE `%s` DROP COLUMN `%s`", table, column)
	if _, err := db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("mysql: drop column: %w", err)
	}
	return nil
}

// ReorderTableColumns uses MySQL's MODIFY COLUMN ... AFTER to reorder columns natively.
// MySQL is the only major RDBMS that supports this without full table recreation.
func (d *MySQLDriver) ReorderTableColumns(ctx context.Context, db *sql.DB, schema, table string, newOrder []string) error {
	if len(newOrder) == 0 {
		return nil
	}
	// Fetch column definitions for all columns (type, nullable, default)
	q := `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COALESCE(COLUMN_DEFAULT,''), COLUMN_KEY
	      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
	      ORDER BY ORDINAL_POSITION`
	rows, err := db.QueryContext(ctx, q, table)
	if err != nil {
		return fmt.Errorf("mysql: reorder fetch cols: %w", err)
	}
	defer rows.Close()

	type colMeta struct{ name, colType, nullable, defVal, key string }
	colsByName := map[string]colMeta{}
	for rows.Next() {
		var m colMeta
		if err := rows.Scan(&m.name, &m.colType, &m.nullable, &m.defVal, &m.key); err != nil {
			return fmt.Errorf("mysql: reorder scan: %w", err)
		}
		colsByName[m.name] = m
	}
	rows.Close()

	// Issue MODIFY COLUMN ... FIRST / AFTER for each column in the new order
	for i, colName := range newOrder {
		m, ok := colsByName[colName]
		if !ok {
			continue
		}
		nullStr := "NOT NULL"
		if strings.ToUpper(m.nullable) == "YES" {
			nullStr = "NULL"
		}
		defStr := ""
		if m.defVal != "" {
			defStr = fmt.Sprintf(" DEFAULT %s", m.defVal)
		}
		var pos string
		if i == 0 {
			pos = "FIRST"
		} else {
			pos = fmt.Sprintf("AFTER `%s`", newOrder[i-1])
		}
		sql := fmt.Sprintf("ALTER TABLE `%s` MODIFY COLUMN `%s` %s %s%s %s", table, m.name, m.colType, nullStr, defStr, pos)
		if _, err := db.ExecContext(ctx, sql); err != nil {
			return fmt.Errorf("mysql: reorder column %s: %w", colName, err)
		}
	}
	return nil
}
