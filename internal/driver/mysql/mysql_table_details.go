// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MySQLDriver) ReadTableDetails(ctx context.Context, sqlDB *sql.DB, schema, table string) (models.MCPTableDetails, error) {
	var tableComment sql.NullString
	err := sqlDB.QueryRowContext(ctx, `
		SELECT TABLE_COMMENT FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'
	`, schema, table).Scan(&tableComment)
	if err == sql.ErrNoRows {
		return models.MCPTableDetails{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}
	if err != nil {
		return models.MCPTableDetails{}, fmt.Errorf("mysql: table details: %w", err)
	}
	out := models.MCPTableDetails{Comment: tableComment.String}

	colRows, err := sqlDB.QueryContext(ctx, `
		SELECT COLUMN_NAME, COLUMN_COMMENT, EXTRA, COLUMN_DEFAULT
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION
	`, schema, table)
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	defer colRows.Close()
	for colRows.Next() {
		var name, extra string
		var comment, def sql.NullString
		if err := colRows.Scan(&name, &comment, &extra, &def); err != nil {
			return models.MCPTableDetails{}, err
		}
		upper := strings.ToUpper(extra)
		out.Columns = append(out.Columns, models.MCPColumnDetails{
			Name:       name,
			Comment:    comment.String,
			IsIdentity: strings.Contains(upper, "AUTO_INCREMENT"),
			Generated:  strings.Contains(upper, "GENERATED"),
			Default:    def.String,
		})
	}
	if err := colRows.Err(); err != nil {
		return models.MCPTableDetails{}, err
	}

	trigRows, err := sqlDB.QueryContext(ctx, `
		SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION
		FROM information_schema.TRIGGERS
		WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
	`, schema, table)
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	defer trigRows.Close()
	byName := map[string]*models.MCPTriggerInfo{}
	var order []string
	for trigRows.Next() {
		var name, timing, event string
		if err := trigRows.Scan(&name, &timing, &event); err != nil {
			return models.MCPTableDetails{}, err
		}
		item, ok := byName[name]
		if !ok {
			item = &models.MCPTriggerInfo{Name: name, Timing: strings.ToUpper(timing), ForEachRow: true}
			byName[name] = item
			order = append(order, name)
		}
		item.Events = append(item.Events, strings.ToUpper(event))
	}
	for _, name := range order {
		out.Triggers = append(out.Triggers, *byName[name])
	}
	return out, trigRows.Err()
}
