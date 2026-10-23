// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// ExplainStatement implements driver.PlanExplainer via EXPLAIN QUERY PLAN.
// SQLite does not report cost or estimated rows (spec: one-part).
func (d *SQLiteDriver) ExplainStatement(ctx context.Context, sqlDB *sql.DB, _, stmt string) (models.MCPPlanSummary, error) {
	rows, err := sqlDB.QueryContext(ctx, "EXPLAIN QUERY PLAN "+stmt)
	if err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("sqlite: explain: %w", err)
	}
	defer rows.Close()

	var details []string
	summary := models.MCPPlanSummary{}
	seen := map[string]bool{}
	for rows.Next() {
		var id, parent, notused int
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			return models.MCPPlanSummary{}, fmt.Errorf("sqlite: explain: scan: %w", err)
		}
		details = append(details, detail)
		table, access, index := parseSQLitePlanDetail(detail)
		if table == "" {
			continue
		}
		key := table + "\x00" + access + "\x00" + index
		if seen[key] {
			continue
		}
		seen[key] = true
		if summary.TopNode == "" {
			summary.TopNode = access
		}
		summary.TablesTouched = append(summary.TablesTouched, models.MCPPlanTableAccess{
			Table: table, Access: access, Index: index,
		})
	}
	if err := rows.Err(); err != nil {
		return models.MCPPlanSummary{}, err
	}
	raw, _ := json.Marshal(details)
	summary.RawPlanJSON = string(raw)
	return summary, nil
}

func parseSQLitePlanDetail(detail string) (table, access, index string) {
	upper := strings.ToUpper(detail)
	access = "seq_scan"
	if strings.Contains(upper, "SEARCH") || strings.Contains(upper, "USING INDEX") || strings.Contains(upper, "COVERING INDEX") {
		access = "index_scan"
		if strings.Contains(upper, "COVERING") {
			access = "index_only"
		}
	}
	fields := strings.Fields(detail)
	for i, f := range fields {
		switch strings.ToUpper(f) {
		case "TABLE", "SCAN", "SEARCH":
			if i+1 < len(fields) && !isSQLitePlanKeyword(fields[i+1]) {
				table = strings.Trim(fields[i+1], `"'`)
			}
		case "INDEX":
			if i+1 < len(fields) {
				index = strings.Trim(fields[i+1], `"'`)
			}
		}
	}
	if table == "" && strings.HasPrefix(upper, "SCAN ") && len(fields) > 1 {
		table = fields[1]
	}
	return table, access, index
}

func isSQLitePlanKeyword(s string) bool {
	switch strings.ToUpper(s) {
	case "USING", "AS", "INDEX", "COVERING", "TABLE", "CONSTANT", "INTEGER":
		return true
	default:
		return false
	}
}
