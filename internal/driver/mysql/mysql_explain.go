// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

type mysqlExplainTable struct {
	TableName  string  `json:"table_name"`
	AccessType string  `json:"access_type"`
	Key        string  `json:"key"`
	Rows       float64 `json:"rows_examined_per_scan"`
}

type mysqlExplainNode struct {
	QueryBlock        *mysqlExplainNode  `json:"query_block"`
	Table             *mysqlExplainTable `json:"table"`
	NestedLoop        []mysqlExplainNode `json:"nested_loop"`
	OrderingOperation *mysqlExplainNode  `json:"ordering_operation"`
	GroupingOperation *mysqlExplainNode  `json:"grouping_operation"`
	Duplicates        *mysqlExplainNode  `json:"duplicating"`
	UnionResult       *mysqlExplainNode  `json:"union_result"`
}

func (d *MySQLDriver) ExplainStatement(ctx context.Context, sqlDB *sql.DB, schema, stmt string) (models.MCPPlanSummary, error) {
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mysql: explain: conn: %w", err)
	}
	defer conn.Close()
	if schema != "" {
		if _, err := conn.ExecContext(ctx, "USE "+d.QuoteIdentifier(schema)); err != nil {
			return models.MCPPlanSummary{}, fmt.Errorf("mysql: explain: use: %w", err)
		}
	}
	var raw string
	if err := conn.QueryRowContext(ctx, "EXPLAIN FORMAT=JSON "+stmt).Scan(&raw); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mysql: explain: %w", err)
	}
	return parseMySQLExplainJSON(raw)
}

func parseMySQLExplainJSON(raw string) (models.MCPPlanSummary, error) {
	var root mysqlExplainNode
	if err := json.Unmarshal([]byte(raw), &root); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("mysql: explain: parse: %w", err)
	}
	summary := models.MCPPlanSummary{RawPlanJSON: raw}
	seen := map[string]bool{}
	var walk func(mysqlExplainNode)
	walk = func(n mysqlExplainNode) {
		if n.QueryBlock != nil {
			walk(*n.QueryBlock)
		}
		if n.OrderingOperation != nil {
			walk(*n.OrderingOperation)
		}
		if n.GroupingOperation != nil {
			walk(*n.GroupingOperation)
		}
		if n.Duplicates != nil {
			walk(*n.Duplicates)
		}
		if n.UnionResult != nil {
			walk(*n.UnionResult)
		}
		for _, child := range n.NestedLoop {
			walk(child)
		}
		if n.Table != nil && n.Table.TableName != "" {
			access := mysqlAccessKind(n.Table.AccessType)
			key := n.Table.TableName + "\x00" + access + "\x00" + n.Table.Key
			if !seen[key] {
				seen[key] = true
				if summary.TopNode == "" {
					summary.TopNode = n.Table.AccessType
				}
				rows := int64(n.Table.Rows)
				summary.EstRows += rows
				summary.TablesTouched = append(summary.TablesTouched, models.MCPPlanTableAccess{
					Table: n.Table.TableName, Access: access, Index: n.Table.Key, EstRows: rows,
				})
			}
		}
	}
	walk(root)
	return summary, nil
}

func mysqlAccessKind(accessType string) string {
	switch strings.ToLower(accessType) {
	case "all", "index":
		if strings.EqualFold(accessType, "index") {
			return "index_only"
		}
		return "seq_scan"
	case "ref", "eq_ref", "const", "range", "ref_or_null", "unique_subquery", "index_subquery":
		return "index_scan"
	default:
		return "seq_scan"
	}
}

var _ driver.PlanExplainer = (*MySQLDriver)(nil)
