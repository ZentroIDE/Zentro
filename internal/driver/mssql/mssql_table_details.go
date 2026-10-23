// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func (d *MSSQLDriver) ReadTableDetails(ctx context.Context, sqlDB *sql.DB, schema, table string) (models.MCPTableDetails, error) {
	var objectID int
	err := sqlDB.QueryRowContext(ctx, `
		SELECT t.object_id FROM sys.tables t
		INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
		WHERE s.name = @p1 AND t.name = @p2
	`, sql.Named("p1", schema), sql.Named("p2", table)).Scan(&objectID)
	if err == sql.ErrNoRows {
		return models.MCPTableDetails{}, fmt.Errorf("there is no table named %q: %w", table, driver.ErrObjectNotFound)
	}
	if err != nil {
		return models.MCPTableDetails{}, fmt.Errorf("mssql: table details: %w", err)
	}

	var out models.MCPTableDetails
	var comment sql.NullString
	_ = sqlDB.QueryRowContext(ctx, `
		SELECT CAST(p.value AS nvarchar(4000))
		FROM sys.extended_properties p
		WHERE p.major_id = @p1 AND p.minor_id = 0 AND p.name = 'MS_Description'
	`, sql.Named("p1", objectID)).Scan(&comment)
	out.Comment = comment.String

	colRows, err := sqlDB.QueryContext(ctx, `
		SELECT c.name, c.is_identity, c.generated_always_type, dc.definition,
		       CAST(ep.value AS nvarchar(4000))
		FROM sys.columns c
		LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
		LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
		WHERE c.object_id = @p1
		ORDER BY c.column_id
	`, sql.Named("p1", objectID))
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	defer colRows.Close()
	for colRows.Next() {
		var name string
		var identity bool
		var generated int
		var def, colComment sql.NullString
		if err := colRows.Scan(&name, &identity, &generated, &def, &colComment); err != nil {
			return models.MCPTableDetails{}, err
		}
		out.Columns = append(out.Columns, models.MCPColumnDetails{
			Name: name, Comment: colComment.String, IsIdentity: identity,
			Generated: generated != 0, Default: def.String,
		})
	}
	if err := colRows.Err(); err != nil {
		return models.MCPTableDetails{}, err
	}

	trigRows, err := sqlDB.QueryContext(ctx, `
		SELECT tr.name, tr.is_instead_of_trigger,
		       OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger'),
		       OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger'),
		       OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger')
		FROM sys.triggers tr WHERE tr.parent_id = @p1
	`, sql.Named("p1", objectID))
	if err != nil {
		return models.MCPTableDetails{}, err
	}
	defer trigRows.Close()
	for trigRows.Next() {
		var name string
		var instead, ins, upd, del bool
		if err := trigRows.Scan(&name, &instead, &ins, &upd, &del); err != nil {
			return models.MCPTableDetails{}, err
		}
		info := models.MCPTriggerInfo{Name: name, Timing: "AFTER", ForEachRow: false}
		if instead {
			info.Timing = "INSTEAD OF"
		}
		if ins {
			info.Events = append(info.Events, "INSERT")
		}
		if upd {
			info.Events = append(info.Events, "UPDATE")
		}
		if del {
			info.Events = append(info.Events, "DELETE")
		}
		out.Triggers = append(out.Triggers, info)
	}
	return out, trigRows.Err()
}
