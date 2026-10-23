// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"encoding/xml"
	"fmt"
	"strings"

	"zentro/internal/models"
)

func (d *MSSQLDriver) ExplainStatement(ctx context.Context, sqlDB *sql.DB, schema, stmt string) (models.MCPPlanSummary, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mssql: explain: conn: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "SET SHOWPLAN_XML ON"); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mssql: explain: showplan on: %w", err)
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), "SET SHOWPLAN_XML OFF") }()

	rows, err := conn.QueryContext(ctx, stmt)
	if err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mssql: explain: %w", err)
	}
	defer rows.Close()
	if !rows.Next() {
		return models.MCPPlanSummary{}, fmt.Errorf("mssql: explain: empty plan")
	}
	var raw string
	if err := rows.Scan(&raw); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mssql: explain: scan: %w", err)
	}
	_ = schema
	return parseShowplanXML(raw)
}

func parseShowplanXML(raw string) (models.MCPPlanSummary, error) {
	summary := models.MCPPlanSummary{RawPlanJSON: raw}
	seen := map[string]bool{}
	collectRelOps(raw, &summary, seen)
	return summary, nil
}

func collectRelOps(raw string, summary *models.MCPPlanSummary, seen map[string]bool) {
	dec := xml.NewDecoder(strings.NewReader(raw))
	var physical, table, index string
	var est float64
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		start, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		switch start.Name.Local {
		case "RelOp":
			physical, est = "", 0
			for _, a := range start.Attr {
				switch a.Name.Local {
				case "PhysicalOp":
					physical = a.Value
				case "EstimateRows":
					fmt.Sscanf(a.Value, "%f", &est)
				}
			}
			if summary.TopNode == "" {
				summary.TopNode = physical
			}
			summary.EstRows += int64(est)
		case "Object":
			table, index = "", ""
			for _, a := range start.Attr {
				switch a.Name.Local {
				case "Table":
					table = strings.Trim(a.Value, "[]")
				case "Index":
					index = strings.Trim(a.Value, "[]")
				}
			}
			if table == "" {
				continue
			}
			access := mssqlAccessKind(physical)
			key := table + "\x00" + access + "\x00" + index
			if seen[key] {
				continue
			}
			seen[key] = true
			summary.TablesTouched = append(summary.TablesTouched, models.MCPPlanTableAccess{
				Table: table, Access: access, Index: index, EstRows: int64(est),
			})
		}
	}
}

func mssqlAccessKind(physical string) string {
	p := strings.ToLower(physical)
	switch {
	case strings.Contains(p, "index scan"), strings.Contains(p, "clustered index scan"):
		return "index_scan"
	case strings.Contains(p, "index seek"), strings.Contains(p, "clustered index seek"):
		return "index_scan"
	case strings.Contains(p, "index"):
		return "index_only"
	default:
		return "seq_scan"
	}
}
