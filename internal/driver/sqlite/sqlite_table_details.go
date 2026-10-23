// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// ReadTableDetails implements driver.TableDetailsReader. SQLite has no
// stored comments; defaults and generated columns come from table_xinfo,
// triggers from sqlite_master.
func (d *SQLiteDriver) ReadTableDetails(ctx context.Context, sqlDB *sql.DB, _, table string) (models.MCPTableDetails, error) {
	exists, err := sqliteObjectExists(ctx, sqlDB, table, "table")
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	if !exists {
		return models.MCPTableDetails{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}

	var out models.MCPTableDetails
	rows, err := sqlDB.QueryContext(ctx, fmt.Sprintf("PRAGMA table_xinfo(%s)", quotePragmaIdent(table)))
	if err != nil {
		rows, err = sqlDB.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", quotePragmaIdent(table)))
		if err != nil {
			return models.MCPTableDetails{}, fmt.Errorf("sqlite: table details: %w", err)
		}
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notnull, pk int
		var name, typ string
		var dflt sql.NullString
		cols, _ := rows.Columns()
		hidden := 0
		dest := []any{&cid, &name, &typ, &notnull, &dflt, &pk}
		if len(cols) >= 7 {
			dest = append(dest, &hidden)
		}
		if err := rows.Scan(dest...); err != nil {
			return models.MCPTableDetails{}, err
		}
		out.Columns = append(out.Columns, models.MCPColumnDetails{
			Name:      name,
			Default:   dflt.String,
			Generated: hidden >= 2,
		})
	}
	if err := rows.Err(); err != nil {
		return models.MCPTableDetails{}, err
	}

	trigRows, err := sqlDB.QueryContext(ctx, `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?`, table)
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	defer trigRows.Close()
	for trigRows.Next() {
		var name string
		var sqlText sql.NullString
		if err := trigRows.Scan(&name, &sqlText); err != nil {
			return models.MCPTableDetails{}, err
		}
		info := models.MCPTriggerInfo{Name: name, ForEachRow: true}
		if sqlText.Valid {
			upper := strings.ToUpper(sqlText.String)
			switch {
			case strings.Contains(upper, "BEFORE"):
				info.Timing = "BEFORE"
			case strings.Contains(upper, "INSTEAD"):
				info.Timing = "INSTEAD OF"
			default:
				info.Timing = "AFTER"
			}
			for _, ev := range []string{"INSERT", "UPDATE", "DELETE"} {
				if strings.Contains(upper, ev) {
					info.Events = append(info.Events, ev)
				}
			}
		}
		out.Triggers = append(out.Triggers, info)
	}
	return out, trigRows.Err()
}
