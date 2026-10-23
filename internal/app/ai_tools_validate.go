// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
)

// validate_sql checks SQL against the real schema without running it (spec
// section 3). It resolves its own environment (resolveEnv, T1.6) instead of
// the one open in the window, since a model may want to check SQL meant for
// an environment the user is not currently looking at.
var aiValidateSQLTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "validate_sql",
		Description: "Checks one or more SQL statements against the real schema without running them: unknown tables or columns, and syntax Postgres itself rejects. CREATE/ALTER/DROP get a token-level check only (balanced parentheses, known keyword), not a database check. Placeholders such as :name are accepted. Use it before suggesting SQL to the user.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"sql":{"type":"string","description":"One or more statements, separated by ;"},` +
			`"env":{"type":"string","description":"An environment key, for example dev or pro. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."}` +
			`},"required":["sql"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Validate some SQL" },
	live:    validateSQLTool,
}

type aiValidationErrorDTO struct {
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Col     int    `json:"col,omitempty"`
}

type aiUnknownObjectDTO struct {
	Kind       string   `json:"kind"`
	Name       string   `json:"name"`
	DidYouMean []string `json:"didYouMean,omitempty"`
}

type aiValidationStatementDTO struct {
	N              int                    `json:"n"`
	Kind           string                 `json:"kind"`
	Valid          bool                   `json:"valid"`
	Errors         []aiValidationErrorDTO `json:"errors"`
	UnknownObjects []aiUnknownObjectDTO   `json:"unknownObjects"`
	CheckedBy      string                 `json:"checkedBy"`
}

type aiValidateSQLDTO struct {
	Valid      bool                       `json:"valid"`
	Statements []aiValidationStatementDTO `json:"statements"`
}

func validateSQLTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		SQL    string `json:"sql"`
		Env    string `json:"env"`
		Schema string `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the SQL to validate in the sql argument", "")
	}

	// Tokenizing (and the one error it can return, ErrUnsupportedToken for a
	// U&-escaped identifier) is driver-agnostic -- decision D8 refuses that
	// form outright, in every dialect -- so this is checked, fail-closed,
	// before paying for a real environment connection.
	tokens, tokErr := db.Tokenize("", in.SQL)
	if tokErr != nil {
		return nil, failTool(aiCodeSQLUnsupported, "this SQL uses a form validate_sql cannot analyze", "Rewrite it without U&-escaped identifiers.")
	}
	stmts := db.SplitTokens(tokens)
	if len(stmts) == 0 {
		return nil, failTool(aiCodeInvalidArgument, "no statement was found in sql", "")
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
	validator, ok := drv.(driverport.SQLValidator)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("validate_sql does not support the %s driver yet", env.Driver), "")
	}

	schema := strings.TrimSpace(in.Schema)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}

	matcher := newCatalogNameMatcher(ctx, s, env, schema)

	out := aiValidateSQLDTO{Valid: true, Statements: make([]aiValidationStatementDTO, 0, len(stmts))}
	ddlChecked := false
	for i, stmtTokens := range stmts {
		if len(stmtTokens) == 0 {
			continue
		}
		stmtText := in.SQL[stmtTokens[0].Start:stmtTokens[len(stmtTokens)-1].End]
		// The assistant writes :name placeholders, as its instructions ask; the
		// database only prepares its own form, so they are rewritten first.
		stmtText, _ = db.RewriteParams(env.Driver, stmtText, db.ParamsForPrepare)

		result, valErr := validator.ValidateStatement(ctx, env.DB, schema, stmtText)
		if valErr != nil {
			return nil, failTool(aiCodeInternal, "the statement could not be checked: "+valErr.Error(), "")
		}
		if !result.Valid {
			out.Valid = false
		}
		if result.CheckedBy == "tokens" {
			ddlChecked = true
		}
		dto := aiValidationStatementDTO{
			N:              i + 1,
			Kind:           result.Kind,
			Valid:          result.Valid,
			Errors:         make([]aiValidationErrorDTO, 0, len(result.Errors)),
			UnknownObjects: make([]aiUnknownObjectDTO, 0, len(result.UnknownObjects)),
			CheckedBy:      result.CheckedBy,
		}
		for _, e := range result.Errors {
			dto.Errors = append(dto.Errors, aiValidationErrorDTO{Message: e.Message, Line: e.Line, Col: e.Col})
		}
		for _, u := range result.UnknownObjects {
			dto.UnknownObjects = append(dto.UnknownObjects, aiUnknownObjectDTO{
				Kind:       u.Kind,
				Name:       u.Name,
				DidYouMean: matcher.suggest(u.Kind, u.Name),
			})
		}
		out.Statements = append(out.Statements, dto)
	}

	var warnings []string
	if ddlChecked {
		warnings = append(warnings, "DDL is checked at the token level only: syntax after the first keyword, data types, and expressions are not verified. Use dry_run on dev or sta to confirm it.")
	}
	warnings = append(warnings, mcpDriverWarnings("validate_sql", env.Driver)...)

	return aiEnvMetaOverride{
		Data:     out,
		Env:      env.Key,
		Driver:   env.Driver,
		Database: env.Database,
		Schema:   schema,
		Warnings: warnings,
	}, nil
}

// catalogNameMatcher suggests the closest real table or column name for an
// unknown one, by edit distance alone -- no catalog access is paid for until
// the first unknown object actually needs one, and each kind is fetched at
// most once per validate_sql call.
type catalogNameMatcher struct {
	ctx    context.Context
	s      *AIService
	env    *resolvedEnv
	schema string

	loadedTables bool
	tables       []string

	loadedColumns bool
	columns       []string
}

func newCatalogNameMatcher(ctx context.Context, s *AIService, env *resolvedEnv, schema string) *catalogNameMatcher {
	return &catalogNameMatcher{ctx: ctx, s: s, env: env, schema: schema}
}

func (m *catalogNameMatcher) suggest(kind, name string) []string {
	var candidates []string
	switch kind {
	case "table":
		candidates = m.tableNames()
	case "column":
		candidates = m.columnNames()
	default:
		return nil
	}
	return nearestNames(name, candidates, 3)
}

func (m *catalogNameMatcher) tableNames() []string {
	if m.loadedTables {
		return m.tables
	}
	m.loadedTables = true
	catalog, err := m.s.loadCatalogFor(m.ctx, m.env.DB, &m.env.Profile, m.env.Key, m.schema, false, false)
	if err != nil {
		return nil
	}
	for _, t := range catalog.Tables {
		m.tables = append(m.tables, t.Name)
	}
	return m.tables
}

func (m *catalogNameMatcher) columnNames() []string {
	if m.loadedColumns {
		return m.columns
	}
	m.loadedColumns = true
	catalog, err := m.s.loadCatalogFor(m.ctx, m.env.DB, &m.env.Profile, m.env.Key, m.schema, false, false)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	for _, t := range catalog.Tables {
		for _, c := range t.Columns {
			if !seen[c.Name] {
				seen[c.Name] = true
				m.columns = append(m.columns, c.Name)
			}
		}
	}
	return m.columns
}

// nearestNames returns, from candidates, the names within maxDistance edits
// of name, nearest first, at most three. An exact case-insensitive match
// never appears (that name is not unknown, so it would not be useful here).
func nearestNames(name string, candidates []string, maxDistance int) []string {
	type scored struct {
		name string
		dist int
	}
	var hits []scored
	lower := strings.ToLower(name)
	for _, c := range candidates {
		if strings.EqualFold(c, name) {
			continue
		}
		d := levenshtein(lower, strings.ToLower(c))
		if d <= maxDistance {
			hits = append(hits, scored{name: c, dist: d})
		}
	}
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j-1].dist > hits[j].dist; j-- {
			hits[j-1], hits[j] = hits[j], hits[j-1]
		}
	}
	if len(hits) > 3 {
		hits = hits[:3]
	}
	out := make([]string, 0, len(hits))
	for _, h := range hits {
		out = append(out, h.name)
	}
	return out
}

// levenshtein is a small, dependency-free edit-distance function (the spec
// asks for one written in-package, not a new module).
func levenshtein(a, b string) int {
	ar, br := []rune(a), []rune(b)
	if len(ar) == 0 {
		return len(br)
	}
	if len(br) == 0 {
		return len(ar)
	}
	prev := make([]int, len(br)+1)
	curr := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		curr[0] = i
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			del := prev[j] + 1
			ins := curr[j-1] + 1
			sub := prev[j-1] + cost
			min := del
			if ins < min {
				min = ins
			}
			if sub < min {
				min = sub
			}
			curr[j] = min
		}
		prev, curr = curr, prev
	}
	return prev[len(br)]
}
