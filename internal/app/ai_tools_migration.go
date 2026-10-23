// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
)

var aiCheckMigrationSafetyTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "check_migration_safety",
		Description: "Analyse DDL for table locks, rewrites, and application-breaking changes. Does not run the SQL.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"sql":{"type":"string"},` +
			`"env":{"type":"string"},` +
			`"schema":{"type":"string"}` +
			`},"required":["sql"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Check migration safety" },
	live:    checkMigrationSafetyTool,
}

var aiGenerateMigrationTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "generate_migration",
		Description: "Generate SQL so to_env's schema matches from_env. Does not execute it.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"from_env":{"type":"string"},` +
			`"to_env":{"type":"string"},` +
			`"kinds":{"type":"array","items":{"type":"string"}},` +
			`"include_drops":{"type":"boolean"}` +
			`},"required":["from_env","to_env"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"from_env", "to_env"},
	label:   func(json.RawMessage) string { return "Generate a migration" },
	live:    generateMigrationTool,
}

type aiMigrationRuleDTO struct {
	ID            string `json:"id"`
	Severity      string `json:"severity"`
	Message       string `json:"message"`
	Lock          string `json:"lock,omitempty"`
	RewritesTable bool   `json:"rewritesTable,omitempty"`
	Alternative   string `json:"alternative,omitempty"`
}

type aiMigrationStatementDTO struct {
	N      int                  `json:"n"`
	Kind   string               `json:"kind"`
	Tables []string             `json:"tables"`
	Rules  []aiMigrationRuleDTO `json:"rules"`
}

type aiMigrationSafetyDTO struct {
	ServerVersion string                    `json:"serverVersion,omitempty"`
	MaxSeverity   string                    `json:"maxSeverity"`
	Statements    []aiMigrationStatementDTO `json:"statements"`
	Unanalyzed    []int                     `json:"unanalyzed"`
}

func checkMigrationSafetyTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		SQL    string `json:"sql"`
		Env    string `json:"env"`
		Schema string `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the DDL to analyse", "")
	}
	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()
	if in.Schema != "" {
		env.Schema = in.Schema
	}
	if msg, hint, denied := mcpToolDeniedByDriver("check_migration_safety", env.Driver); denied {
		return nil, failTool(aiCodeUnsupportedDriver, msg, hint)
	}
	sizes := s.tableSizeHints(ctx, env)
	out := analyzeMigrationSQL(in.SQL, env.Driver, sizes)
	return aiEnvMetaOverride{Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: env.Schema, Warnings: mcpDriverWarnings("check_migration_safety", env.Driver)}, nil
}

func generateMigrationTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		From         string   `json:"from_env"`
		To           string   `json:"to_env"`
		Kinds        []string `json:"kinds"`
		IncludeDrops bool     `json:"include_drops"`
	}
	if err := json.Unmarshal(args, &in); err != nil || in.From == "" || in.To == "" {
		return nil, failTool(aiCodeEnvRequired, "pass from_env and to_env", "")
	}
	fromEnv, err := s.resolveEnv(ctx, in.From)
	if err != nil {
		return nil, err
	}
	defer fromEnv.Close()
	toEnv, err := s.resolveEnv(ctx, in.To)
	if err != nil {
		return nil, err
	}
	defer toEnv.Close()
	if msg, hint, denied := mcpToolDeniedByDriver("generate_migration", fromEnv.Driver); denied {
		return nil, failTool(aiCodeUnsupportedDriver, msg, hint)
	}
	drv, ok := core.Get(fromEnv.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, "the driver is not available", "")
	}
	kinds := map[string]bool{"table": true, "index": true, "constraint": true, "view": true}
	if len(in.Kinds) > 0 {
		kinds = map[string]bool{}
		for _, k := range in.Kinds {
			kinds[k] = true
		}
	}
	fromSnap, err := readSchemaForDiff(ctx, drv, fromEnv, kinds)
	if err != nil {
		return nil, failTool(aiCodeInternal, "the source schema could not be read", "")
	}
	toSnap, err := readSchemaForDiff(ctx, drv, toEnv, kinds)
	if err != nil {
		return nil, failTool(aiCodeInternal, "the target schema could not be read", "")
	}
	fromSnap.Supported, toSnap.Supported = true, true
	mig, err := generateSchemaMigration(fromSnap, toSnap)
	if err != nil {
		return nil, err
	}
	upSQL := mig.SQL
	if !in.IncludeDrops {
		upSQL = stripDropStatements(upSQL)
	}
	sizes := s.tableSizeHints(ctx, toEnv)
	safety := analyzeMigrationSQL(upSQL, toEnv.Driver, sizes)
	return aiEnvMetaOverride{
		Data: struct {
			Up       string               `json:"up"`
			Down     string               `json:"down"`
			Safety   aiMigrationSafetyDTO `json:"safety"`
			Warnings []string             `json:"warnings"`
		}{Up: upSQL, Down: "", Safety: safety, Warnings: append(mig.Warnings, mcpDriverWarnings("generate_migration", toEnv.Driver)...)},
		Env: toEnv.Key, Driver: toEnv.Driver, Database: toEnv.Database, Schema: toEnv.Schema,
	}, nil
}

func stripDropStatements(sql string) string {
	tokens, err := db.Tokenize("", sql)
	if err != nil {
		return sql
	}
	var keep []string
	for _, stmt := range db.SplitTokens(tokens) {
		if db.FirstKeyword(stmt) == "drop" {
			continue
		}
		if len(stmt) == 0 {
			continue
		}
		keep = append(keep, sql[stmt[0].Start:stmt[len(stmt)-1].End])
	}
	return strings.Join(keep, ";\n")
}

func (s *AIService) tableSizeHints(ctx context.Context, env *resolvedEnv) map[string]int64 {
	out := map[string]int64{}
	drv, ok := core.Get(env.Driver)
	if !ok {
		return out
	}
	reader, ok := drv.(driverport.TableStatsReader)
	if !ok {
		return out
	}
	catalog, err := loadCatalogForEnv(ctx, s, env, env.Schema)
	if err != nil {
		return out
	}
	for _, table := range catalog.Tables {
		stats, err := reader.ReadTableStats(ctx, env.DB, env.Schema, table.Name, false)
		if err != nil || stats.EstRows == nil {
			continue
		}
		out[strings.ToLower(table.Name)] = *stats.EstRows
	}
	return out
}

func analyzeMigrationSQL(sql, driverName string, sizes map[string]int64) aiMigrationSafetyDTO {
	out := aiMigrationSafetyDTO{MaxSeverity: "info", Statements: []aiMigrationStatementDTO{}, Unanalyzed: []int{}}
	tokens, err := db.Tokenize("", sql)
	if err != nil {
		out.MaxSeverity = "warning"
		out.Unanalyzed = []int{0}
		return out
	}
	hasLockTimeout := false
	stmts := db.SplitTokens(tokens)
	for i, stmt := range stmts {
		n := i + 1
		kind := db.FirstKeyword(stmt)
		item := aiMigrationStatementDTO{N: n, Kind: kind, Tables: []string{}, Rules: []aiMigrationRuleDTO{}}
		words := db.LeadWords(stmt)
		switch {
		case kind == "set" && containsWord(words, "lock_timeout"):
			hasLockTimeout = true
		case kind == "drop" && containsWord(words, "table"), kind == "truncate":
			item.Rules = append(item.Rules, rule("drop_table_or_truncate", "critical", "This removes the table or every row.", "", false, "Rename first, delete later."))
		case kind == "create" && containsWord(words, "index") && driverName == constant.DriverMySQL && !containsWord(words, "algorithm"):
			item.Rules = append(item.Rules, sizedRule("mysql_index_algorithm", "CREATE INDEX without ALGORITHM/LOCK may rebuild the table and block writes.", "LOCK=SHARED", false, "ADD INDEX ..., ALGORITHM=INPLACE, LOCK=NONE", tableFrom(words, "on"), sizes))
		case kind == "create" && containsWord(words, "index") && !containsWord(words, "concurrently"):
			item.Rules = append(item.Rules, sizedRule("create_index_blocking", "CREATE INDEX without CONCURRENTLY blocks writes.", "SHARE", false, "CREATE INDEX CONCURRENTLY", tableFrom(words, "on"), sizes))
		case kind == "create" && containsWord(words, "concurrently") && len(stmts) > 1:
			item.Rules = append(item.Rules, rule("concurrently_in_transaction", "critical", "CREATE INDEX CONCURRENTLY cannot run inside a multi-statement transaction.", "", false, "Propose it as its own single statement."))
		case kind == "alter":
			item.Rules = append(item.Rules, alterTableRules(words, sizes)...)
			item.Tables = tablesFromAlter(words)
		case kind == "do" || kind == "execute":
			out.Unanalyzed = append(out.Unanalyzed, n)
			out.MaxSeverity = bumpSeverity(out.MaxSeverity, "warning")
		default:
			if kind != "set" {
				out.Unanalyzed = append(out.Unanalyzed, n)
			}
		}
		for _, r := range item.Rules {
			out.MaxSeverity = bumpSeverity(out.MaxSeverity, r.Severity)
		}
		out.Statements = append(out.Statements, item)
	}
	if !hasLockTimeout && out.MaxSeverity != "info" {
		out.Statements = append(out.Statements, aiMigrationStatementDTO{
			N: 0, Kind: "script", Rules: []aiMigrationRuleDTO{
				rule("missing_lock_timeout", "warning", "A strong lock is taken and the script never sets lock_timeout.", "", false, "SET lock_timeout at the start of the script."),
			},
		})
		out.MaxSeverity = bumpSeverity(out.MaxSeverity, "warning")
	}
	return out
}

func containsWord(words []string, want string) bool {
	for _, w := range words {
		if w == want {
			return true
		}
	}
	return false
}

func tableFrom(words []string, after string) string {
	for i, w := range words {
		if w == after && i+1 < len(words) {
			return words[i+1]
		}
	}
	return ""
}

func tablesFromAlter(words []string) []string {
	for i, w := range words {
		if w == "table" && i+1 < len(words) {
			j := skipIfExistsWords(words, i+1)
			if j < len(words) && words[j] == "only" {
				j++
			}
			if j < len(words) {
				return []string{words[j]}
			}
		}
	}
	return nil
}

func alterTableRules(words []string, sizes map[string]int64) []aiMigrationRuleDTO {
	table := ""
	if t := tablesFromAlter(words); len(t) > 0 {
		table = t[0]
	}
	var rules []aiMigrationRuleDTO
	joined := strings.Join(words, " ")
	if strings.Contains(joined, "drop column") {
		rules = append(rules, rule("drop_column_data_loss", "critical", "DROP COLUMN discards data.", "ACCESS EXCLUSIVE", false, "Stop using the column in code first."))
	}
	if strings.Contains(joined, "rename") {
		rules = append(rules, rule("rename_breaks_clients", "warning", "A rename breaks clients still using the old name.", "", false, "Add the new name, dual-write, then drop the old one."))
	}
	if strings.Contains(joined, "add") && strings.Contains(joined, "not") && strings.Contains(joined, "null") && !strings.Contains(joined, "default") {
		rules = append(rules, sizedCriticalIfRows("add_not_null_column_no_default", "ADD COLUMN NOT NULL without DEFAULT fails if the table has rows.", table, sizes))
	}
	if strings.Contains(joined, "set") && strings.Contains(joined, "not") && strings.Contains(joined, "null") {
		rules = append(rules, sizedRule("set_not_null_scan", "SET NOT NULL scans the table under ACCESS EXCLUSIVE.", "ACCESS EXCLUSIVE", false, "ADD CONSTRAINT ... NOT VALID, VALIDATE, then SET NOT NULL.", table, sizes))
	}
	if strings.Contains(joined, "type") {
		rules = append(rules, sizedRule("alter_column_type_rewrite", "ALTER COLUMN TYPE is treated as a table rewrite unless it is a varchar widen or text change.", "ACCESS EXCLUSIVE", true, "Add a new column and backfill.", table, sizes))
	}
	if strings.Contains(joined, "foreign") || (strings.Contains(joined, "add") && strings.Contains(joined, "check") && !strings.Contains(joined, "not valid")) {
		rules = append(rules, sizedRule("add_constraint_validating", "ADD CONSTRAINT validates existing rows under a strong lock.", "ACCESS EXCLUSIVE", false, "ADD ... NOT VALID, then VALIDATE CONSTRAINT.", table, sizes))
	}
	if strings.Contains(joined, "unique") || strings.Contains(joined, "primary") {
		rules = append(rules, sizedRule("add_unique_blocking", "UNIQUE or PRIMARY KEY builds an index under a strong lock.", "ACCESS EXCLUSIVE", false, "CREATE UNIQUE INDEX CONCURRENTLY, then ADD CONSTRAINT USING INDEX.", table, sizes))
	}
	return rules
}

func rule(id, severity, message, lock string, rewrite bool, alt string) aiMigrationRuleDTO {
	return aiMigrationRuleDTO{ID: id, Severity: severity, Message: message, Lock: lock, RewritesTable: rewrite, Alternative: alt}
}

func sizedRule(id, message, lock string, rewrite bool, alt, table string, sizes map[string]int64) aiMigrationRuleDTO {
	sev := "warning"
	if n, ok := sizes[strings.ToLower(table)]; ok {
		if n < 10000 {
			sev = "info"
		} else if n >= 1000000 {
			sev = "critical"
		}
	}
	return rule(id, sev, message, lock, rewrite, alt)
}

func sizedCriticalIfRows(id, message, table string, sizes map[string]int64) aiMigrationRuleDTO {
	sev := "warning"
	if n, ok := sizes[strings.ToLower(table)]; ok && n > 0 {
		sev = "critical"
	}
	return rule(id, sev, message, "ACCESS EXCLUSIVE", false, "Add a nullable column, backfill, then SET NOT NULL.")
}

func skipIfExistsWords(words []string, i int) int {
	if i < len(words) && words[i] == "if" {
		if i+1 < len(words) && words[i+1] == "exists" {
			return i + 2
		}
		if i+2 < len(words) && words[i+1] == "not" && words[i+2] == "exists" {
			return i + 3
		}
	}
	return i
}

func bumpSeverity(cur, next string) string {
	rank := map[string]int{"info": 0, "warning": 1, "critical": 2}
	if rank[next] > rank[cur] {
		return next
	}
	return cur
}
