// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"zentro/internal/db"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

var aiRunReadonlyQueryTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "run_readonly_query",
		Description: "Run exactly one SELECT, WITH, or VALUES statement against real rows in a read-only transaction that always rolls back. Sensitive columns are always masked. Never use it for writes.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"An environment key, for example dev or sta. Required."},` +
			`"sql":{"type":"string","description":"Exactly one SELECT, WITH, or VALUES statement."},` +
			`"params":{"type":"array","description":"Values for $1..$n or ? placeholders."},` +
			`"max_rows":{"type":"integer","minimum":1,"description":"Defaults to 100, never more than 200."},` +
			`"timeout_seconds":{"type":"integer","minimum":1,"description":"Defaults to 15."}` +
			`},"required":["env","sql"],"additionalProperties":false}`),
	},
	group:   aiGroupDataRows,
	rows:    true,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Run a read-only query" },
	live:    runReadonlyQueryTool,
}

type aiResultColumnDTO struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type aiReadonlyQueryDTO struct {
	Columns       []aiResultColumnDTO `json:"columns"`
	Rows          [][]string          `json:"rows"`
	RowCount      int                 `json:"rowCount"`
	Truncated     bool                `json:"truncated"`
	MaskedColumns []string            `json:"maskedColumns"`
	ElapsedMs     int64               `json:"elapsedMs"`
}

func runReadonlyQueryTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env            string `json:"env"`
		SQL            string `json:"sql"`
		Params         []any  `json:"params"`
		MaxRows        int    `json:"max_rows"`
		TimeoutSeconds int    `json:"timeout_seconds"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass env and the SQL to run", "")
	}
	if g := db.GuardReadOnly("", in.SQL); g != nil {
		return nil, guardToToolError(g)
	}

	env, runner, _, schema, err := s.openReadRunner(ctx, in.Env, "")
	if err != nil {
		return nil, err
	}
	defer env.Close()

	policy := s.executionPolicy(env.Key)
	maxRows := clampMaxRows(in.MaxRows, policy)
	timeout := clampTimeout(in.TimeoutSeconds, policy)
	start := time.Now()

	raw, runErr := runner.RunReadOnly(ctx, env.DB, models.MCPReadOnlyQuery{
		SQL: in.SQL, Params: in.Params, MaxRows: maxRows,
		Timeout: timeout, LockTimeout: time.Second, IdleTimeout: timeout, Schema: schema,
	})
	if runErr != nil {
		return nil, mapRunnerError(runErr)
	}

	catalog, catErr := loadCatalogForEnv(ctx, s, env, schema)
	if catErr != nil {
		catalog = ai.Catalog{Schema: schema}
	}
	maskedSet := map[string]bool{}
	for _, table := range catalog.Tables {
		for name := range maskedColumnsForTable(table.Name, table.Columns) {
			maskedSet[name] = true
		}
	}
	var maskedNames []string
	for _, col := range raw.Columns {
		if columnIsMasked(col.Name, maskedSet) {
			maskedNames = append(maskedNames, col.Name)
		}
	}

	out := aiReadonlyQueryDTO{
		Columns:       make([]aiResultColumnDTO, 0, len(raw.Columns)),
		Rows:          make([][]string, 0, len(raw.Rows)),
		Truncated:     raw.Truncated,
		MaskedColumns: maskedNames,
		ElapsedMs:     time.Since(start).Milliseconds(),
	}
	for _, col := range raw.Columns {
		out.Columns = append(out.Columns, aiResultColumnDTO{Name: col.Name, Type: col.Type})
	}
	for _, row := range raw.Rows {
		line := make([]string, len(out.Columns))
		for i := range out.Columns {
			var v any
			if i < len(row) {
				v = row[i]
			}
			line[i] = serializeCell(v, columnIsMasked(out.Columns[i].Name, maskedSet))
		}
		out.Rows = append(out.Rows, line)
	}
	out.RowCount = len(out.Rows)

	return aiEnvMetaOverride{
		Data:      out,
		Env:       env.Key,
		Driver:    env.Driver,
		Database:  env.Database,
		Schema:    schema,
		Warnings:  append(raw.Warnings, mcpDriverWarnings("run_readonly_query", env.Driver)...),
		Truncated: raw.Truncated,
	}, nil
}
