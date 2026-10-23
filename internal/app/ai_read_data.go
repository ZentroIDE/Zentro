// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
	"zentro/internal/utils"
)

func (s *AIService) executionPolicy(envKey string) ExecutionPolicy {
	if src, err := s.contextSource(); err == nil && src.policy != nil {
		return src.policy(envKey)
	}
	return resolveExecutionPolicy(utils.Preferences{}, envKey)
}

func guardToToolError(g *db.GuardReject) error {
	if g == nil {
		return nil
	}
	hint := ""
	if g.Reason != "" {
		hint = "reason: " + g.Reason
	}
	if g.Code == db.GuardSQLNotAllowed {
		if hint != "" {
			hint += ". "
		}
		hint += "Use propose_change so a person can review a write."
	}
	code := aiCodeSQLNotAllowed
	if g.Code == db.GuardSQLUnsupported {
		code = aiCodeSQLUnsupported
	}
	return failTool(code, g.Message, hint)
}

func shapeToToolError(err *db.CountShapeError) error {
	if err == nil {
		return nil
	}
	code := aiCodeSQLUnsupported
	if err.Code == db.GuardSQLNotAllowed {
		code = aiCodeSQLNotAllowed
	}
	hint := err.Hint
	if err.Reason != "" {
		if hint != "" {
			hint = "reason: " + err.Reason + ". " + hint
		} else {
			hint = "reason: " + err.Reason
		}
	}
	return failTool(code, err.Message, hint)
}

func (s *AIService) openReadRunner(ctx context.Context, envArg, schemaArg string) (*resolvedEnv, driverport.ReadOnlyRunner, driverport.QueryDialect, string, error) {
	env, err := s.resolveEnv(ctx, envArg)
	if err != nil {
		return nil, nil, nil, "", err
	}
	drv, ok := core.Get(env.Driver)
	if !ok {
		env.Close()
		return nil, nil, nil, "", failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", env.Driver), "")
	}
	runner, ok := drv.(driverport.ReadOnlyRunner)
	if !ok {
		env.Close()
		return nil, nil, nil, "", failTool(aiCodeUnsupportedDriver, fmt.Sprintf("this tool does not support the %s driver yet", env.Driver), "")
	}
	dialect, _ := drv.(driverport.QueryDialect)
	schema := strings.TrimSpace(schemaArg)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		env.Close()
		return nil, nil, nil, "", failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}
	return env, runner, dialect, schema, nil
}

func loadCatalogForEnv(ctx context.Context, s *AIService, env *resolvedEnv, schema string) (ai.Catalog, error) {
	profile := env.Profile
	catalog, err := s.loadCatalogFor(ctx, env.DB, &profile, env.Key, schema, false, false)
	if err != nil {
		return ai.Catalog{}, failTool(aiCodeInternal, "the schema could not be read: "+err.Error(), "")
	}
	return catalog, nil
}

func matchCountTable(catalog ai.Catalog, target *db.CountTarget) (ai.Table, error) {
	table, ok := findTable(catalog, target.Table)
	if !ok {
		return ai.Table{}, failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no table named %q in schema %s", target.Table, catalog.Schema), didYouMeanHint(nearestNames(target.Table, tableNames(catalog), 3), ""))
	}
	return table, nil
}

func rewriteFromClause(dialect driverport.QueryDialect, schema string, table ai.Table, alias string) string {
	quote := dialect.QuoteIdentifier
	from := db.QuoteQualified(quote, schema, table.Name)
	if alias != "" {
		from += " AS " + quote(alias)
	}
	return from
}

func buildCountSQL(dialect driverport.QueryDialect, schema string, table ai.Table, target *db.CountTarget, maxCount int) string {
	from := rewriteFromClause(dialect, schema, table, target.Alias)
	inner := "SELECT 1 FROM " + from
	if target.WhereSQL != "" {
		inner += " " + target.WhereSQL
	}
	if maxCount < 1 {
		maxCount = 1
	}
	return "SELECT count(*) FROM (" + inner + " LIMIT " + strconv.Itoa(maxCount+1) + ") zentro_impact"
}

func buildKeySampleSQL(dialect driverport.QueryDialect, schema string, table ai.Table, target *db.CountTarget, pks []string, n int) string {
	quote := dialect.QuoteIdentifier
	cols := make([]string, len(pks))
	for i, pk := range pks {
		cols[i] = quote(pk)
	}
	sql := "SELECT " + strings.Join(cols, ", ") + " FROM " + rewriteFromClause(dialect, schema, table, target.Alias)
	if target.WhereSQL != "" {
		sql += " " + target.WhereSQL
	}
	return sql + " LIMIT " + strconv.Itoa(n)
}

func runGuardedCount(ctx context.Context, runner driverport.ReadOnlyRunner, env *resolvedEnv, schema, sql string, timeout, lock time.Duration) (int64, error) {
	if g := db.GuardReadOnly(env.Driver, sql); g != nil {
		return 0, guardToToolError(g)
	}
	result, err := runner.RunReadOnly(ctx, env.DB, models.MCPReadOnlyQuery{
		SQL: sql, MaxRows: 1, Timeout: timeout, LockTimeout: lock, IdleTimeout: timeout, Schema: schema,
	})
	if err != nil {
		return 0, mapRunnerError(err)
	}
	if len(result.Rows) == 0 || len(result.Rows[0]) == 0 {
		return 0, nil
	}
	return intFromCell(result.Rows[0][0]), nil
}

func intFromCell(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	case int32:
		return int64(n)
	case float64:
		return int64(n)
	case []byte:
		parsed, _ := strconv.ParseInt(string(n), 10, 64)
		return parsed
	case string:
		parsed, _ := strconv.ParseInt(n, 10, 64)
		return parsed
	default:
		parsed, _ := strconv.ParseInt(fmt.Sprint(n), 10, 64)
		return parsed
	}
}

func mapRunnerError(err error) error {
	if err == nil {
		return nil
	}
	if errorsIsTimeout(err) {
		return failTool(aiCodeTimeout, "the statement timed out", "")
	}
	if errorsIsRollback(err) {
		return failTool(aiCodeInternal, "the transaction could not be rolled back; the connection was closed", "")
	}
	return failTool(aiCodeInternal, "the statement could not be run", "")
}

func errorsIsTimeout(err error) bool {
	return err == driverport.ErrStatementTimeout || strings.Contains(strings.ToLower(err.Error()), "timed out")
}

func errorsIsRollback(err error) bool {
	return err == driverport.ErrRollbackUnconfirmed
}

// aiMaxDataRows is the most rows any tool sends a model in one call (ADR 0017).
const aiMaxDataRows = 10

func clampMaxRows(requested int, policy ExecutionPolicy) int {
	n := requested
	if n <= 0 {
		n = aiMaxDataRows
	}
	capAt := aiMaxDataRows
	if policy.RowCapPerTab > 0 && policy.RowCapPerTab < capAt {
		capAt = policy.RowCapPerTab
	}
	if n > capAt {
		n = capAt
	}
	return n
}

func clampTimeout(requested int, policy ExecutionPolicy) time.Duration {
	secs := requested
	if secs <= 0 {
		secs = 15
	}
	if policy.TimeoutSeconds > 0 && secs > policy.TimeoutSeconds {
		secs = policy.TimeoutSeconds
	}
	return time.Duration(secs) * time.Second
}

func primaryKeyNames(table ai.Table) []string {
	var pks []string
	for _, col := range table.Columns {
		if col.PrimaryKey {
			pks = append(pks, col.Name)
		}
	}
	return pks
}
