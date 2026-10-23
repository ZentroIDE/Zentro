// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ReadTableDetails implements driver.TableDetailsReader for Postgres (spec
// section 4, describe_table): comments from pg_description, identity and
// generated columns from pg_attribute, defaults from pg_attrdef, triggers
// from pg_trigger (never a trigger function's body), and partitioning from
// pg_partitioned_table and pg_inherits.
func (d *PostgresDriver) ReadTableDetails(ctx context.Context, sqlDB *sql.DB, schema, table string) (models.MCPTableDetails, error) {
	var out models.MCPTableDetails
	var oid uint32
	var relkind string
	var comment sql.NullString
	err := sqlDB.QueryRowContext(ctx, `
		SELECT c.oid, c.relkind, obj_description(c.oid, 'pg_class')
		FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2
	`, schema, table).Scan(&oid, &relkind, &comment)
	if err == sql.ErrNoRows {
		return out, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}
	if err != nil {
		return out, fmt.Errorf("postgres: table details: %w", err)
	}
	out.Comment = comment.String

	if out.Columns, err = readColumnDetails(ctx, sqlDB, oid); err != nil {
		return out, fmt.Errorf("postgres: table details: columns: %w", err)
	}
	if out.Triggers, err = readTriggerInfo(ctx, sqlDB, oid); err != nil {
		return out, fmt.Errorf("postgres: table details: triggers: %w", err)
	}
	if relkind == "p" {
		if err := sqlDB.QueryRowContext(ctx, `SELECT pg_get_partkeydef($1::oid)`, oid).Scan(&out.PartitionKey); err != nil {
			return out, fmt.Errorf("postgres: table details: partition key: %w", err)
		}
		if out.Partitions, out.PartitionCount, err = readPartitions(ctx, sqlDB, oid); err != nil {
			return out, fmt.Errorf("postgres: table details: partitions: %w", err)
		}
	}
	return out, nil
}

func readColumnDetails(ctx context.Context, sqlDB *sql.DB, oid uint32) ([]models.MCPColumnDetails, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT a.attname,
		       coalesce(col_description(a.attrelid, a.attnum), ''),
		       a.attidentity <> '',
		       a.attgenerated <> '',
		       coalesce(pg_get_expr(ad.adbin, ad.adrelid), '')
		FROM pg_attribute a
		LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
		WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped
		ORDER BY a.attnum
	`, oid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.MCPColumnDetails
	for rows.Next() {
		var c models.MCPColumnDetails
		if err := rows.Scan(&c.Name, &c.Comment, &c.IsIdentity, &c.Generated, &c.Default); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func readTriggerInfo(ctx context.Context, sqlDB *sql.DB, oid uint32) ([]models.MCPTriggerInfo, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT t.tgname, t.tgtype::int
		FROM pg_trigger t
		WHERE t.tgrelid = $1::oid AND NOT t.tgisinternal
		ORDER BY t.tgname
	`, oid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.MCPTriggerInfo
	for rows.Next() {
		var name string
		var tgtype int
		if err := rows.Scan(&name, &tgtype); err != nil {
			return nil, err
		}
		info := decodeTriggerType(tgtype)
		info.Name = name
		out = append(out, info)
	}
	return out, rows.Err()
}

// Bits of pg_trigger.tgtype, from Postgres' own catalog/pg_trigger.h.
const (
	triggerTypeRow      = 1 << 0
	triggerTypeBefore   = 1 << 1
	triggerTypeInsert   = 1 << 2
	triggerTypeDelete   = 1 << 3
	triggerTypeUpdate   = 1 << 4
	triggerTypeTruncate = 1 << 5
	triggerTypeInstead  = 1 << 6
)

// decodeTriggerType turns pg_trigger.tgtype into when the trigger fires.
func decodeTriggerType(tgtype int) models.MCPTriggerInfo {
	info := models.MCPTriggerInfo{Timing: "AFTER", ForEachRow: tgtype&triggerTypeRow != 0}
	switch {
	case tgtype&triggerTypeInstead != 0:
		info.Timing = "INSTEAD OF"
	case tgtype&triggerTypeBefore != 0:
		info.Timing = "BEFORE"
	}
	for _, ev := range []struct {
		bit  int
		name string
	}{{triggerTypeInsert, "INSERT"}, {triggerTypeUpdate, "UPDATE"}, {triggerTypeDelete, "DELETE"}, {triggerTypeTruncate, "TRUNCATE"}} {
		if tgtype&ev.bit != 0 {
			info.Events = append(info.Events, ev.name)
		}
	}
	return info
}

func readPartitions(ctx context.Context, sqlDB *sql.DB, oid uint32) ([]string, int, error) {
	var total int
	if err := sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM pg_inherits WHERE inhparent = $1::oid`, oid).Scan(&total); err != nil {
		return nil, 0, err
	}
	names, err := queryNames(ctx, sqlDB, `
		SELECT child.relname
		FROM pg_inherits i JOIN pg_class child ON child.oid = i.inhrelid
		WHERE i.inhparent = $1::oid
		ORDER BY child.relname
		LIMIT $2
	`, oid, models.MaxMCPPartitions)
	return names, total, err
}
