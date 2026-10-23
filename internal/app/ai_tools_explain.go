// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
)

// explain_plan returns an estimated plan for one statement, never executing
// it (spec section 3). Like validate_sql, it resolves its own environment
// (resolveEnv, T1.6).
var aiExplainPlanTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "explain_plan",
		Description: "The estimated query plan for exactly one statement, without running it: total cost, estimated rows, which tables get a sequential or index scan, and flags for a large sequential scan, a large nested loop, or stale statistics. Placeholders such as :name are read as NULL. Use it before suggesting a query that might be slow.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"sql":{"type":"string","description":"Exactly one statement: SELECT, INSERT, UPDATE, DELETE, MERGE, or VALUES. Never start it with EXPLAIN yourself."},` +
			`"env":{"type":"string","description":"An environment key, for example dev or pro. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."},` +
			`"format":{"type":"string","enum":["summary","raw"],"description":"summary (default) omits rawPlan; raw includes it, with literal values replaced by ?."}` +
			`},"required":["sql"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Explain a query plan" },
	live:    explainPlanTool,
}

// explainPlanThresholds names the numbers flagging decisions compare
// against, so they are never scattered as bare literals across the rules
// below. The spec calls them "defaults, configurable."
type explainPlanThresholds struct {
	SeqScanLargeRows    int64
	NestedLoopLargeRows int64
}

var defaultExplainPlanThresholds = explainPlanThresholds{
	SeqScanLargeRows:    10000,
	NestedLoopLargeRows: 1000,
}

var aiExplainAcceptedFirstKeywords = map[string]bool{
	"select": true, "insert": true, "update": true, "delete": true, "merge": true, "values": true, "with": true,
}

type aiPlanTableAccessDTO struct {
	Table           string `json:"table"`
	Access          string `json:"access"`
	Index           string `json:"index,omitempty"`
	EstRows         int64  `json:"estRows"`
	StatsAgeSeconds *int64 `json:"statsAgeSeconds,omitempty"`
}

type aiPlanFlagDTO struct {
	Type     string `json:"type"`
	Table    string `json:"table,omitempty"`
	Severity string `json:"severity"`
	Detail   string `json:"detail"`
}

type aiExplainPlanDTO struct {
	TotalCost     float64                `json:"totalCost"`
	EstRows       int64                  `json:"estRows"`
	TopNode       string                 `json:"topNode"`
	TablesTouched []aiPlanTableAccessDTO `json:"tablesTouched"`
	Flags         []aiPlanFlagDTO        `json:"flags"`
	RawPlan       string                 `json:"rawPlan,omitempty"`
}

func explainPlanTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		SQL    string `json:"sql"`
		Env    string `json:"env"`
		Schema string `json:"schema"`
		Format string `json:"format"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the statement to explain in the sql argument", "")
	}
	format := strings.ToLower(strings.TrimSpace(in.Format))
	if format == "" {
		format = "summary"
	}
	if format != "summary" && format != "raw" {
		return nil, failTool(aiCodeInvalidArgument, "format must be summary or raw", "")
	}

	// Driver-agnostic, fail-closed tokenizing (decision D8), same reasoning
	// as validate_sql: this never needs a real connection to reject input.
	tokens, tokErr := db.Tokenize("", in.SQL)
	if tokErr != nil {
		return nil, failTool(aiCodeSQLUnsupported, "this SQL uses a form explain_plan cannot analyze", "Rewrite it without U&-escaped identifiers.")
	}
	stmts := db.SplitTokens(tokens)
	if len(stmts) == 0 {
		return nil, failTool(aiCodeInvalidArgument, "no statement was found in sql", "")
	}
	if len(stmts) > 1 {
		return nil, failTool(aiCodeSQLUnsupported, "explain_plan accepts exactly one statement", "reason: multi_statement")
	}
	first := db.FirstKeyword(stmts[0])
	if first == "explain" {
		// The caller must never add EXPLAIN itself: Zentro adds it, and
		// Postgres would otherwise accept a nested EXPLAIN ANALYZE, which
		// executes the statement (postgres_explain.go documents the same
		// rule as its own safety net).
		return nil, failTool(aiCodeSQLNotAllowed, "do not start sql with EXPLAIN; explain_plan adds it", "")
	}
	if !aiExplainAcceptedFirstKeywords[first] {
		return nil, failTool(aiCodeSQLUnsupported, fmt.Sprintf("explain_plan does not accept a statement starting with %q", first), "reason: unsupported_statement")
	}

	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()

	drv, ok := core.Get(env.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", env.Driver), "")
	}
	explainer, ok := drv.(driverport.PlanExplainer)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("explain_plan does not support the %s driver yet", env.Driver), "")
	}

	schema := strings.TrimSpace(in.Schema)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}

	stmtText := in.SQL[stmts[0][0].Start:stmts[0][len(stmts[0])-1].End]
	// EXPLAIN takes no parameters, so each placeholder becomes NULL. The plan
	// can differ from one for real values, and the result says so.
	stmtText, nulled := db.RewriteParams(env.Driver, stmtText, db.ParamsAsNull)
	summary, explainErr := explainer.ExplainStatement(ctx, env.DB, schema, stmtText)
	if explainErr != nil {
		return nil, failTool(aiCodeInternal, "the plan could not be read: "+explainErr.Error(), "")
	}

	out := aiExplainPlanDTO{
		TotalCost:     summary.TotalCost,
		EstRows:       summary.EstRows,
		TopNode:       summary.TopNode,
		TablesTouched: make([]aiPlanTableAccessDTO, 0, len(summary.TablesTouched)),
		Flags:         []aiPlanFlagDTO{},
	}
	for _, t := range summary.TablesTouched {
		item := aiPlanTableAccessDTO{Table: t.Table, Access: t.Access, Index: t.Index, EstRows: t.EstRows}
		if t.StatsAge != nil {
			secs := int64(t.StatsAge.Seconds())
			item.StatsAgeSeconds = &secs
		}
		out.TablesTouched = append(out.TablesTouched, item)
		if t.StatsAge == nil {
			out.Flags = append(out.Flags, aiPlanFlagDTO{
				Type: "stale_stats", Table: t.Table, Severity: "warning",
				Detail: t.Table + " has never been analyzed; row estimates may be unreliable.",
			})
		}
	}

	// A second, app-layer decode of the same RawPlanJSON the driver already
	// parsed once: flagging needs the tree shape (Filter text, nested-loop
	// outer side), which the driver's flattened TablesTouched does not
	// carry. A decode failure here (should not happen; the driver parsed it
	// first) degrades to "no tree-shaped flags" rather than failing the tool.
	if roots, err := decodeExplainFlagRoots(summary.RawPlanJSON); err == nil && len(roots) > 0 {
		out.Flags = append(out.Flags, walkExplainFlags(roots[0].Plan, defaultExplainPlanThresholds)...)
	}

	if format == "raw" {
		out.RawPlan = normalizePlanJSONStrings(summary.RawPlanJSON)
	}

	return aiEnvMetaOverride{
		Data:     out,
		Env:      env.Key,
		Driver:   env.Driver,
		Database: env.Database,
		Schema:   schema,
		Warnings: append(explainWarnings(nulled), mcpDriverWarnings("explain_plan", env.Driver)...),
	}, nil
}

// explainFlagNode is the subset of Postgres' EXPLAIN (FORMAT JSON) tree the
// flag rules need. It is a second, app-layer decode of the same RawPlanJSON
// the driver already parsed once for TablesTouched: the driver returns
// facts only, and flagging (judgment) belongs here, not in the driver.
type explainFlagNode struct {
	NodeType     string            `json:"Node Type"`
	RelationName string            `json:"Relation Name"`
	Filter       string            `json:"Filter"`
	PlanRows     int64             `json:"Plan Rows"`
	Plans        []explainFlagNode `json:"Plans"`
}

func decodeExplainFlagRoots(raw string) ([]struct {
	Plan explainFlagNode `json:"Plan"`
}, error) {
	var roots []struct {
		Plan explainFlagNode `json:"Plan"`
	}
	if err := json.Unmarshal([]byte(raw), &roots); err != nil {
		return nil, err
	}
	return roots, nil
}

// walkExplainFlags implements the two tree-shaped rules (seq_scan_large,
// nested_loop_large); stale_stats is computed from TablesTouched instead,
// by the caller, since it needs StatsAge, which this tree does not carry.
func walkExplainFlags(node explainFlagNode, thresholds explainPlanThresholds) []aiPlanFlagDTO {
	var flags []aiPlanFlagDTO
	if node.NodeType == "Seq Scan" && node.Filter != "" && node.PlanRows > thresholds.SeqScanLargeRows {
		flags = append(flags, aiPlanFlagDTO{
			Type: "seq_scan_large", Table: node.RelationName, Severity: "warning",
			Detail: fmt.Sprintf("a sequential scan with a filter is estimated to read %d rows", node.PlanRows),
		})
	}
	if node.NodeType == "Nested Loop" && len(node.Plans) > 0 {
		outer := node.Plans[0]
		if outer.PlanRows > thresholds.NestedLoopLargeRows {
			flags = append(flags, aiPlanFlagDTO{
				Type: "nested_loop_large", Table: outer.RelationName, Severity: "warning",
				Detail: fmt.Sprintf("a nested loop's outer side is estimated at %d rows", outer.PlanRows),
			})
		}
	}
	for _, child := range node.Plans {
		flags = append(flags, walkExplainFlags(child, thresholds)...)
	}
	return flags
}

// aiNormalizedPlanKeyPattern matches one "<key>":"<value>" pair for a plan
// field known to hold a SQL-like expression rather than a label or a count
// (Filter, Index Cond, ...). Matching is string-level only, on the raw JSON
// text itself -- never a decode into an untyped dynamic structure, which
// this package's own guardrails forbid regardless.
var aiNormalizedPlanKeyPattern = regexp.MustCompile(`"(Filter|Index Cond|Recheck Cond|Hash Cond|Join Filter|Merge Cond)":"((?:[^"\\]|\\.)*)"`)

// normalizePlanJSONStrings replaces literal values inside the plan's own
// filter-like string fields with ?, string-processing only (no parser), per
// the spec's "no-parser" rule. A match that fails to re-encode as a JSON
// string (should not happen; it was one already) is left untouched rather
// than risking a corrupted result.
func normalizePlanJSONStrings(raw string) string {
	return aiNormalizedPlanKeyPattern.ReplaceAllStringFunc(raw, func(match string) string {
		groups := aiNormalizedPlanKeyPattern.FindStringSubmatch(match)
		key, quoted := groups[1], groups[2]
		var value string
		if err := json.Unmarshal([]byte(`"`+quoted+`"`), &value); err != nil {
			return match
		}
		normalized, err := json.Marshal(db.NormalizeLiterals(value))
		if err != nil {
			return match
		}
		return `"` + key + `":` + string(normalized)
	})
}

func explainWarnings(nulled int) []string {
	warnings := []string{"flags are heuristics based on estimates, not measurements."}
	if nulled > 0 {
		warnings = append(warnings, "placeholders were replaced by NULL to read the plan; real values can change it.")
	}
	return warnings
}
