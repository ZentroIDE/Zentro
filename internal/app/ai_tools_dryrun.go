// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

var aiDryRunTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "dry_run",
		Description: "Run INSERT, UPDATE, DELETE, or DDL in a real transaction on dev or sta, then always roll it back. Never allowed on production.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"dev or sta only."},` +
			`"sql":{"type":"string","description":"One or more INSERT, UPDATE, DELETE, or DDL statements."},` +
			`"timeout_seconds":{"type":"integer","minimum":1,"description":"Defaults to 15."},` +
			`"lock_timeout_ms":{"type":"integer","minimum":1,"description":"Defaults to 1000."}` +
			`},"required":["env","sql"],"additionalProperties":false}`),
	},
	group:   aiGroupReadData,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Dry-run a change" },
	live:    dryRunTool,
}

type aiDryRunErrorDTO struct {
	SQLState   string `json:"sqlstate,omitempty"`
	Constraint string `json:"constraint,omitempty"`
	Message    string `json:"message,omitempty"`
}

type aiDryRunStatementDTO struct {
	N            int               `json:"n"`
	Kind         string            `json:"kind"`
	Status       string            `json:"status"`
	RowsAffected int64             `json:"rowsAffected"`
	ElapsedMs    int64             `json:"elapsedMs"`
	Error        *aiDryRunErrorDTO `json:"error,omitempty"`
}

type aiDryRunLockDTO struct {
	Relation string `json:"relation"`
	Mode     string `json:"mode"`
}

type aiDryRunDTO struct {
	Statements       []aiDryRunStatementDTO `json:"statements"`
	LocksHeld        []aiDryRunLockDTO      `json:"locksHeld"`
	TriggersOnTarget []aiTriggerDTO         `json:"triggersOnTarget"`
	Caveats          []string               `json:"caveats"`
	RolledBack       bool                   `json:"rolledBack"`
}

func dryRunTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env            string `json:"env"`
		SQL            string `json:"sql"`
		TimeoutSeconds int    `json:"timeout_seconds"`
		LockTimeoutMs  int    `json:"lock_timeout_ms"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass env and the SQL to dry-run", "")
	}
	if environmentIsProduction(in.Env) {
		return nil, failTool(aiCodePermissionDenied, "dry_run is not allowed in production", "Use estimate_impact instead.")
	}

	tokens, tokErr := db.Tokenize("", in.SQL)
	if tokErr != nil {
		return nil, failTool(aiCodeSQLUnsupported, "this SQL uses a form dry_run cannot analyze", "Rewrite it without U&-escaped identifiers.")
	}
	stmts := db.SplitTokens(tokens)
	if len(stmts) == 0 {
		return nil, failTool(aiCodeInvalidArgument, "no statement was found in sql", "")
	}
	texts := make([]string, 0, len(stmts))
	for _, stmt := range stmts {
		if len(stmt) == 0 {
			continue
		}
		first := db.FirstKeyword(stmt)
		switch first {
		case "insert", "update", "delete", "create", "alter", "drop", "truncate", "with":
		default:
			return nil, failTool(aiCodeSQLNotAllowed, "dry_run accepts INSERT, UPDATE, DELETE, or DDL", "")
		}
		texts = append(texts, in.SQL[stmt[0].Start:stmt[len(stmt)-1].End])
	}

	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()
	if environmentIsProduction(env.Key) {
		return nil, failTool(aiCodePermissionDenied, "dry_run is not allowed in production", "Use estimate_impact instead.")
	}

	policy := s.executionPolicy(env.Key)
	classified := classifyForEnv(in.SQL, env.Driver, policy)
	if classified.Verdict == classifyBlocked {
		return nil, failTool(aiCodePolicyBlocked, "this SQL is blocked by the environment safety policy", "")
	}

	drv, ok := core.Get(env.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, "the driver is not available", "")
	}
	runner, ok := drv.(driverport.DryRunner)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, "dry_run does not support this driver yet", "")
	}
	schema := env.Schema
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "")
	}

	timeout := clampTimeout(in.TimeoutSeconds, policy)
	lock := time.Duration(in.LockTimeoutMs) * time.Millisecond
	if lock <= 0 {
		lock = time.Second
	}

	raw, runErr := runner.RunDry(ctx, env.DB, models.MCPDryRunQuery{
		Statements: texts, Timeout: timeout, LockTimeout: lock, IdleTimeout: timeout, Schema: schema,
	})
	if runErr != nil {
		return nil, mapRunnerError(runErr)
	}

	out := aiDryRunDTO{
		Statements:       make([]aiDryRunStatementDTO, 0, len(raw.Statements)),
		LocksHeld:        make([]aiDryRunLockDTO, 0, len(raw.LocksHeld)),
		TriggersOnTarget: []aiTriggerDTO{},
		Caveats:          raw.Caveats,
		RolledBack:       raw.RolledBack,
	}
	if out.Caveats == nil {
		out.Caveats = []string{}
	}
	for _, st := range raw.Statements {
		item := aiDryRunStatementDTO{N: st.N, Kind: st.Kind, Status: st.Status, RowsAffected: st.RowsAffected, ElapsedMs: st.ElapsedMs}
		if st.Status == "error" {
			// The database's own message can quote the row that failed (a
			// duplicate key names its value), so only the code and the
			// constraint name go back to the model.
			item.Error = &aiDryRunErrorDTO{SQLState: st.SQLState, Constraint: st.Constraint, Message: dryRunErrorMessage(st.SQLState, st.Constraint)}
		}
		out.Statements = append(out.Statements, item)
	}
	for _, lockRow := range raw.LocksHeld {
		out.LocksHeld = append(out.LocksHeld, aiDryRunLockDTO{Relation: lockRow.Relation, Mode: lockRow.Mode})
	}

	if details, ok := drv.(driverport.TableDetailsReader); ok {
		if target, shapeErr := db.ParseCountTarget(env.Driver, texts[0], false); shapeErr == nil {
			if det, dErr := details.ReadTableDetails(ctx, env.DB, schema, target.Table); dErr == nil {
				want := strings.ToUpper(target.Kind)
				for _, trig := range det.Triggers {
					if triggerMatches(trig.Events, want) {
						out.TriggersOnTarget = append(out.TriggersOnTarget, aiTriggerDTO{Name: trig.Name, Timing: trig.Timing, Events: trig.Events, ForEachRow: trig.ForEachRow})
					}
				}
			}
		}
	}

	return aiEnvMetaOverride{
		Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema,
		Warnings: mcpDriverWarnings("dry_run", env.Driver),
	}, nil
}

// dryRunErrorMessage describes a failed statement without the database's own
// text, which may contain row values.
func dryRunErrorMessage(sqlState, constraint string) string {
	msg := "the statement failed"
	if constraint != "" {
		msg += " on constraint " + constraint
	}
	if sqlState != "" {
		msg += " (SQLSTATE " + sqlState + ")"
	}
	return msg
}
