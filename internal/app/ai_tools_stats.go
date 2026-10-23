// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

// get_table_stats and list_indexes read catalog-level size and usage facts
// without scanning table data (spec section 3). Both resolve their own
// environment like validate_sql and explain_plan.
var aiGetTableStatsTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "get_table_stats",
		Description: "Size and usage statistics for one table, from the catalog, never a table scan: estimated row count (null if never analyzed), byte sizes, vacuum and analyze history, and scan counters. Pass with_columns for per-column null fraction and distinct-value estimates. Never returns sample values.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"table":{"type":"string","description":"The table name as search_schema returned it."},` +
			`"with_columns":{"type":"boolean","description":"Include per-column statistics. Defaults to false."},` +
			`"env":{"type":"string","description":"An environment key, for example dev or pro. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."}` +
			`},"required":["table"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label: func(args json.RawMessage) string {
		var in struct{ Table string }
		_ = json.Unmarshal(args, &in)
		return "Read the statistics of " + in.Table
	},
	live: getTableStatsTool,
}

var aiListIndexesTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "list_indexes",
		Description: "The indexes of one table, or the whole schema if table is omitted, plus up to four issues this detects: a foreign key column with no leading index (missing_fk_index), two indexes that are really the same one (duplicate), a secondary index with zero scans (unused), and an index left invalid by a failed CREATE INDEX CONCURRENTLY (invalid). Suggests only; never creates or drops an index.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"table":{"type":"string","description":"Limit to one table. Omit to scan the whole schema."},` +
			`"checks":{"type":"array","items":{"type":"string","enum":["missing_fk_index","duplicate","unused","invalid"]},"description":"Which issue checks to run. Defaults to all four."},` +
			`"env":{"type":"string","description":"An environment key, for example dev or pro. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."}` +
			`},"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label: func(args json.RawMessage) string {
		var in struct{ Table string }
		_ = json.Unmarshal(args, &in)
		if in.Table == "" {
			return "List the indexes of the schema"
		}
		return "List the indexes of " + in.Table
	},
	live: listIndexesTool,
}

type aiTableStatsColumnDTO struct {
	Name         string  `json:"name"`
	NullFraction float64 `json:"nullFraction"`
	NDistinct    float64 `json:"nDistinct"`
	AvgWidth     int     `json:"avgWidth"`
}

type aiTableStatsDTO struct {
	EstRows         *int64                  `json:"estRows"`
	Exact           bool                    `json:"exact"`
	TotalBytes      int64                   `json:"totalBytes"`
	TableBytes      int64                   `json:"tableBytes"`
	IndexBytes      int64                   `json:"indexBytes"`
	ToastBytes      int64                   `json:"toastBytes"`
	LastVacuum      *string                 `json:"lastVacuum,omitempty"`
	LastAutovacuum  *string                 `json:"lastAutovacuum,omitempty"`
	LastAnalyze     *string                 `json:"lastAnalyze,omitempty"`
	LastAutoanalyze *string                 `json:"lastAutoanalyze,omitempty"`
	EstDeadTuples   int64                   `json:"estDeadTuples"`
	SeqScans        int64                   `json:"seqScans"`
	IdxScans        int64                   `json:"idxScans"`
	StatsSince      *string                 `json:"statsSince,omitempty"`
	Partitioned     bool                    `json:"partitioned"`
	PartitionCount  int                     `json:"partitionCount"`
	Columns         []aiTableStatsColumnDTO `json:"columns,omitempty"`
}

// formatTimePtr renders a *time.Time as RFC 3339, or nil if there is none.
func formatTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

func getTableStatsTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Table       string `json:"table"`
		WithColumns bool   `json:"with_columns"`
		Env         string `json:"env"`
		Schema      string `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.Table) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the table to read in the table argument", "")
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
	reader, ok := drv.(driverport.TableStatsReader)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("get_table_stats does not support the %s driver yet", env.Driver), "")
	}

	schema := strings.TrimSpace(in.Schema)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}

	table, err := resolveTableName(ctx, s, env, schema, in.Table)
	if err != nil {
		return nil, err
	}

	stats, statsErr := reader.ReadTableStats(ctx, env.DB, schema, table, in.WithColumns)
	if statsErr != nil {
		return nil, failTool(aiCodeInternal, "the table statistics could not be read: "+statsErr.Error(), "")
	}

	out := aiTableStatsDTO{
		EstRows: stats.EstRows, Exact: false,
		TotalBytes: stats.TotalBytes, TableBytes: stats.TableBytes, IndexBytes: stats.IndexBytes, ToastBytes: stats.ToastBytes,
		LastVacuum: formatTimePtr(stats.LastVacuum), LastAutovacuum: formatTimePtr(stats.LastAutovacuum),
		LastAnalyze: formatTimePtr(stats.LastAnalyze), LastAutoanalyze: formatTimePtr(stats.LastAutoanalyze),
		EstDeadTuples: stats.EstDeadTuples, SeqScans: stats.SeqScans, IdxScans: stats.IdxScans,
		StatsSince:  formatTimePtr(stats.StatsSince),
		Partitioned: stats.Partitioned, PartitionCount: stats.PartitionCount,
	}
	for _, c := range stats.Columns {
		out.Columns = append(out.Columns, aiTableStatsColumnDTO{Name: c.Name, NullFraction: c.NullFraction, NDistinct: c.NDistinct, AvgWidth: c.AvgWidth})
	}

	return aiEnvMetaOverride{Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema, Warnings: mcpDriverWarnings("get_table_stats", env.Driver)}, nil
}

// resolveTableName checks a table argument against the resolved
// environment's own catalog (not the window's open one), so a name typo
// gets OBJECT_NOT_FOUND instead of a raw database error.
func resolveTableName(ctx context.Context, s *AIService, env *resolvedEnv, schema, name string) (string, error) {
	catalog, err := s.loadCatalogFor(ctx, env.DB, &env.Profile, env.Key, schema, false, false)
	if err != nil {
		return "", failTool(aiCodeInternal, "the schema could not be read: "+err.Error(), "")
	}
	table, ok := findTable(catalog, strings.TrimSpace(name))
	if !ok {
		return "", failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no table named %q in schema %s", name, schema), "Use search_schema to find it.")
	}
	return table.Name, nil
}

type aiIndexDTO struct {
	Table     string   `json:"table"`
	Name      string   `json:"name"`
	Columns   []string `json:"columns"`
	Unique    bool     `json:"unique"`
	Primary   bool     `json:"primary"`
	Method    string   `json:"method"`
	Predicate string   `json:"predicate,omitempty"`
	SizeBytes int64    `json:"sizeBytes"`
	Scans     int64    `json:"scans"`
}

type aiIndexIssueDTO struct {
	Type     string   `json:"type"`
	Table    string   `json:"table"`
	Index    string   `json:"index"`
	Columns  []string `json:"columns,omitempty"`
	Severity string   `json:"severity"`
	Detail   string   `json:"detail"`
}

type aiListIndexesDTO struct {
	Indexes    []aiIndexDTO      `json:"indexes"`
	Issues     []aiIndexIssueDTO `json:"issues"`
	StatsSince *string           `json:"statsSince,omitempty"`
}

// indexIssueThresholds names the numbers the index-issue rules compare
// against, so none of them are bare literals in the rule bodies below.
type indexIssueThresholds struct {
	MissingFKIndexWarningRows  int64
	MissingFKIndexCriticalRows int64
	UnusedRecentDays           int
}

var defaultIndexIssueThresholds = indexIssueThresholds{
	MissingFKIndexWarningRows:  10000,
	MissingFKIndexCriticalRows: 1000000,
	UnusedRecentDays:           7,
}

var aiAllIndexChecks = []string{"missing_fk_index", "duplicate", "unused", "invalid"}

func listIndexesTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Table  string   `json:"table"`
		Checks []string `json:"checks"`
		Env    string   `json:"env"`
		Schema string   `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	checks := map[string]bool{}
	if len(in.Checks) == 0 {
		for _, c := range aiAllIndexChecks {
			checks[c] = true
		}
	} else {
		for _, c := range in.Checks {
			checks[c] = true
		}
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
	indexReader, ok := drv.(driverport.IndexReader)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("list_indexes does not support the %s driver yet", env.Driver), "")
	}

	schema := strings.TrimSpace(in.Schema)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}

	var tables []string
	if strings.TrimSpace(in.Table) != "" {
		table, nameErr := resolveTableName(ctx, s, env, schema, in.Table)
		if nameErr != nil {
			return nil, nameErr
		}
		tables = []string{table}
	} else {
		catalog, catErr := s.loadCatalogFor(ctx, env.DB, &env.Profile, env.Key, schema, false, false)
		if catErr != nil {
			return nil, failTool(aiCodeInternal, "the schema could not be read: "+catErr.Error(), "")
		}
		for _, t := range catalog.Tables {
			tables = append(tables, t.Name)
		}
	}

	out := aiListIndexesDTO{Indexes: []aiIndexDTO{}, Issues: []aiIndexIssueDTO{}}
	fetcher, hasFK := drv.(driverport.SchemaFetcher)
	statsReader, hasStats := drv.(driverport.TableStatsReader)

	byTable := map[string][]models.MCPIndexInfo{}
	for _, table := range tables {
		indexes, idxErr := indexReader.ReadIndexes(ctx, env.DB, schema, table)
		if idxErr != nil {
			return nil, failTool(aiCodeInternal, "the indexes could not be read: "+idxErr.Error(), "")
		}
		byTable[table] = indexes
		for _, idx := range indexes {
			if out.StatsSince == nil {
				out.StatsSince = formatTimePtr(idx.StatsSince)
			}
			out.Indexes = append(out.Indexes, aiIndexDTO{
				Table: idx.Table, Name: idx.Name, Columns: idx.Columns, Unique: idx.Unique, Primary: idx.Primary,
				Method: idx.Method, Predicate: db.NormalizeLiterals(idx.Predicate), SizeBytes: idx.SizeBytes, Scans: idx.Scans,
			})
		}
	}

	if checks["duplicate"] {
		for table, indexes := range byTable {
			out.Issues = append(out.Issues, duplicateIndexIssues(table, indexes)...)
		}
	}
	if checks["unused"] {
		for table, indexes := range byTable {
			out.Issues = append(out.Issues, unusedIndexIssues(table, indexes, defaultIndexIssueThresholds)...)
		}
	}
	if checks["invalid"] {
		for table, indexes := range byTable {
			out.Issues = append(out.Issues, invalidIndexIssues(table, indexes)...)
		}
	}
	if checks["missing_fk_index"] && hasFK {
		for table, indexes := range byTable {
			rels, relErr := fetcher.FetchTableRelationships(ctx, env.DB, schema, table)
			if relErr != nil {
				continue // a missing_fk_index check that cannot read FKs skips, it does not fail the whole tool
			}
			var estRows *int64
			if hasStats {
				if stats, statErr := statsReader.ReadTableStats(ctx, env.DB, schema, table, false); statErr == nil {
					estRows = stats.EstRows
				}
			}
			out.Issues = append(out.Issues, missingFKIndexIssues(table, rels, indexes, estRows, defaultIndexIssueThresholds)...)
		}
	}

	return aiEnvMetaOverride{Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema, Warnings: mcpDriverWarnings("list_indexes", env.Driver)}, nil
}

// missingFKIndexIssues flags a foreign key column that is not the leading
// column of any index on its own table -- the side Postgres must scan in
// full on every delete or update of the referenced row.
func missingFKIndexIssues(table string, rels []models.TableRelationship, indexes []models.MCPIndexInfo, estRows *int64, thresholds indexIssueThresholds) []aiIndexIssueDTO {
	var issues []aiIndexIssueDTO
	for _, rel := range rels {
		if !strings.EqualFold(rel.SourceTable, table) {
			continue // this table is the referenced (parent) side, not the one that needs the index
		}
		covered := false
		for _, idx := range indexes {
			if len(idx.Columns) > 0 && strings.EqualFold(idx.Columns[0], rel.SourceColumn) {
				covered = true
				break
			}
		}
		if covered {
			continue
		}
		severity := "info"
		switch {
		case estRows != nil && *estRows >= thresholds.MissingFKIndexCriticalRows:
			severity = "critical"
		case estRows != nil && *estRows >= thresholds.MissingFKIndexWarningRows:
			severity = "warning"
		}
		issues = append(issues, aiIndexIssueDTO{
			Type: "missing_fk_index", Table: table, Index: "", Columns: []string{rel.SourceColumn}, Severity: severity,
			Detail: fmt.Sprintf("%s.%s references %s but has no leading index; deletes and updates on the parent row scan this table in full", table, rel.SourceColumn, rel.TargetTable),
		})
	}
	return issues
}

func duplicateIndexIssues(table string, indexes []models.MCPIndexInfo) []aiIndexIssueDTO {
	var issues []aiIndexIssueDTO
	for i := 0; i < len(indexes); i++ {
		for j := i + 1; j < len(indexes); j++ {
			a, b := indexes[i], indexes[j]
			if sameIndexShape(a, b) {
				issues = append(issues, aiIndexIssueDTO{
					Type: "duplicate", Table: table, Index: b.Name, Columns: b.Columns, Severity: "warning",
					Detail: fmt.Sprintf("%s duplicates %s: same columns, order, method, and predicate", b.Name, a.Name),
				})
			}
		}
	}
	return issues
}

func sameIndexShape(a, b models.MCPIndexInfo) bool {
	if a.Method != b.Method || a.Predicate != b.Predicate || len(a.Columns) != len(b.Columns) {
		return false
	}
	for i := range a.Columns {
		if !strings.EqualFold(a.Columns[i], b.Columns[i]) {
			return false
		}
	}
	return true
}

func unusedIndexIssues(table string, indexes []models.MCPIndexInfo, thresholds indexIssueThresholds) []aiIndexIssueDTO {
	var issues []aiIndexIssueDTO
	for _, idx := range indexes {
		if idx.Primary || idx.Unique || idx.Scans != 0 || idx.Scans < 0 {
			continue
		}
		severity := "warning"
		if idx.StatsSince != nil && time.Since(*idx.StatsSince) < time.Duration(thresholds.UnusedRecentDays)*24*time.Hour {
			severity = "info"
		}
		issues = append(issues, aiIndexIssueDTO{
			Type: "unused", Table: table, Index: idx.Name, Columns: idx.Columns, Severity: severity,
			Detail: fmt.Sprintf("%s has 0 scans and is not a primary key or unique constraint", idx.Name),
		})
	}
	return issues
}

func invalidIndexIssues(table string, indexes []models.MCPIndexInfo) []aiIndexIssueDTO {
	var issues []aiIndexIssueDTO
	for _, idx := range indexes {
		if idx.Valid {
			continue
		}
		issues = append(issues, aiIndexIssueDTO{
			Type: "invalid", Table: table, Index: idx.Name, Columns: idx.Columns, Severity: "critical",
			Detail: fmt.Sprintf("%s is invalid, likely from a failed CREATE INDEX CONCURRENTLY", idx.Name),
		})
	}
	return issues
}
