// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"zentro/internal/models"
)

// explainPlanNode is one node of Postgres' own EXPLAIN (FORMAT JSON) tree.
// Only the fields PlanExplainer uses are named; the rest of the real output
// (Startup Cost, Output, Parallel Aware, ...) is simply dropped by
// encoding/json, not read.
type explainPlanNode struct {
	NodeType     string            `json:"Node Type"`
	RelationName string            `json:"Relation Name"`
	IndexName    string            `json:"Index Name"`
	TotalCost    float64           `json:"Total Cost"`
	PlanRows     int64             `json:"Plan Rows"`
	Plans        []explainPlanNode `json:"Plans"`
}

type explainPlanRoot struct {
	Plan explainPlanNode `json:"Plan"`
}

// ExplainStatement implements driver.PlanExplainer for Postgres (spec
// section 3, explain_plan). It runs EXPLAIN (FORMAT JSON) -- never ANALYZE,
// so the statement is only ever estimated, not run -- inside a read-only
// transaction that is always rolled back.
//
// stmt is handed to Postgres as "EXPLAIN (FORMAT JSON) " + stmt without
// checking its own first keyword first; that check belongs to the tool
// layer (T2.3), which must refuse a stmt that itself starts with EXPLAIN
// before this is ever called. If it is not refused, Postgres sees a nested
// EXPLAIN and raises a syntax error -- ANALYZE is never reached either way,
// so a missed check upstream fails safely here, not silently.
func (d *PostgresDriver) ExplainStatement(ctx context.Context, sqlDB *sql.DB, schema, stmt string) (models.MCPPlanSummary, error) {
	tx, err := sqlDB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("postgres: explain: begin: %w", err)
	}
	defer tx.Rollback()

	if schema != "" {
		if _, err := tx.ExecContext(ctx, "SET LOCAL search_path TO "+quoteIdentifier(schema)); err != nil {
			return models.MCPPlanSummary{}, fmt.Errorf("postgres: explain: set search_path: %w", err)
		}
	}

	var rawJSON string
	if err := tx.QueryRowContext(ctx, "EXPLAIN (FORMAT JSON) "+stmt).Scan(&rawJSON); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("postgres: explain: %w", err)
	}

	summary, err := parseExplainPlanJSON(rawJSON)
	if err != nil {
		return models.MCPPlanSummary{}, err
	}
	// StatsAge is a nice-to-have on top of the plan itself; a failure here
	// (e.g. the view does not exist on this Postgres build) does not throw
	// away an otherwise good plan.
	_ = fillStatsAge(ctx, tx, schema, summary.TablesTouched)
	return summary, nil
}

// parseExplainPlanJSON reads Postgres' own EXPLAIN (FORMAT JSON) output (a
// one-element JSON array) into the shape explain_plan returns. No database
// access here; it is pure so it can be tested against a fixture plan.
func parseExplainPlanJSON(raw string) (models.MCPPlanSummary, error) {
	var roots []explainPlanRoot
	if err := json.Unmarshal([]byte(raw), &roots); err != nil {
		return models.MCPPlanSummary{}, fmt.Errorf("postgres: explain: parse plan: %w", err)
	}
	if len(roots) == 0 {
		return models.MCPPlanSummary{}, fmt.Errorf("postgres: explain: empty plan")
	}

	root := roots[0].Plan
	summary := models.MCPPlanSummary{
		TotalCost:   root.TotalCost,
		EstRows:     root.PlanRows,
		TopNode:     root.NodeType,
		RawPlanJSON: raw,
	}

	seen := map[string]bool{}
	var walk func(explainPlanNode)
	walk = func(n explainPlanNode) {
		if n.RelationName != "" {
			if access := explainAccessKind(n.NodeType); access != "" {
				key := n.RelationName + "\x00" + access + "\x00" + n.IndexName
				if !seen[key] {
					seen[key] = true
					summary.TablesTouched = append(summary.TablesTouched, models.MCPPlanTableAccess{
						Table: n.RelationName, Access: access, Index: n.IndexName, EstRows: n.PlanRows,
					})
				}
			}
		}
		for _, child := range n.Plans {
			walk(child)
		}
	}
	walk(root)
	return summary, nil
}

// explainAccessKind maps a plan node's own "Node Type" to tablesTouched's
// access enum. A node type this does not recognize (a join, an aggregate, a
// sort) is not a table access at all and returns "".
func explainAccessKind(nodeType string) string {
	switch nodeType {
	case "Seq Scan":
		return "seq_scan"
	case "Index Scan":
		return "index_scan"
	case "Index Only Scan":
		return "index_only"
	case "Bitmap Heap Scan", "Bitmap Index Scan":
		return "bitmap"
	default:
		return ""
	}
}

// txQuerier is the one method fillStatsAge needs; *sql.Tx and *sql.DB both
// satisfy it, so tests can pass either.
type txQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// fillStatsAge looks up, for every distinct table touched, how long since it
// was last analyzed (autovacuum's ANALYZE counts too), and sets StatsAge on
// each matching entry. A table pg_stat_user_tables has no row for (never
// analyzed, or not a table pg_stat tracks) keeps StatsAge nil.
func fillStatsAge(ctx context.Context, q txQuerier, schema string, touched []models.MCPPlanTableAccess) error {
	if len(touched) == 0 {
		return nil
	}
	names := make([]string, 0, len(touched))
	seen := map[string]bool{}
	for _, t := range touched {
		if !seen[t.Table] {
			seen[t.Table] = true
			names = append(names, t.Table)
		}
	}

	rows, err := q.QueryContext(ctx,
		`SELECT relname, GREATEST(last_analyze, last_autoanalyze) FROM pg_stat_user_tables WHERE schemaname = $1 AND relname = ANY($2)`,
		schema, names,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now()
	ages := make(map[string]time.Duration, len(names))
	for rows.Next() {
		var name string
		var lastAnalyze sql.NullTime
		if err := rows.Scan(&name, &lastAnalyze); err != nil {
			return err
		}
		if lastAnalyze.Valid {
			ages[name] = now.Sub(lastAnalyze.Time)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for i := range touched {
		if age, ok := ages[touched[i].Table]; ok {
			touched[i].StatsAge = &age
		}
	}
	return nil
}
