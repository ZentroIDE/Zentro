// SPDX-License-Identifier: GPL-3.0-only

// Package models (this file): the shapes the MCP tool ports (internal/driver)
// return for the "read and check" group of agent tools (spec section 3).
// Every type here is prefixed MCP to keep it apart from the schema editor's
// own types of a similar name (e.g. models.IndexInfo, used by IndexEditor),
// which carry a different, smaller shape for a different caller.
package models

import "time"

// MCPValidationError is one error from checking a single statement.
// Postgres fills Line/Col from the database's own reported character
// position (no SQL parser involved); SQLState is the five-character code
// (e.g. "42P01") a caller uses to classify the failure.
type MCPValidationError struct {
	Message  string
	Line     int
	Col      int
	SQLState string
}

// MCPUnknownObject is a table or column name validate_sql's database check
// found missing. Kind is "table" or "column".
type MCPUnknownObject struct {
	Kind string
	Name string
}

// MCPValidationResult is one statement's validate_sql result. The caller
// (internal/app) assembles several of these into the tool's statements[]
// array, since SQLValidator checks one statement per call.
type MCPValidationResult struct {
	// Kind is "select", "insert", "update", "delete", "ddl", or "other".
	Kind           string
	Valid          bool
	Errors         []MCPValidationError
	UnknownObjects []MCPUnknownObject
	// CheckedBy is "database" (PREPARE caught real errors) or "tokens" (DDL,
	// which cannot be PREPAREd, so only its token shape was checked).
	CheckedBy string
}

// MCPPlanTableAccess is one table touched by a plan.
type MCPPlanTableAccess struct {
	Table string
	// Access is "seq_scan", "index_scan", "index_only", or "bitmap".
	Access  string
	Index   string
	EstRows int64
	// StatsAge is time since the table was last analyzed, nil if never.
	StatsAge *time.Duration
}

// MCPPlanSummary is explain_plan's result for one statement.
type MCPPlanSummary struct {
	TotalCost     float64
	EstRows       int64
	TopNode       string
	TablesTouched []MCPPlanTableAccess
	// RawPlanJSON is EXPLAIN (FORMAT JSON)'s own text, unmodified. The caller
	// normalizes any literal it decides to keep when the tool's format is
	// "raw"; PlanExplainer does not decide that.
	RawPlanJSON string
}

// MCPDependencyQuery is what find_dependencies asks for.
type MCPDependencyQuery struct {
	Object string
	// Column narrows the search to dependents of this one column. Empty
	// means the whole object.
	Column string
	// Direction is "dependents", "dependencies", or "both".
	Direction string
	// Depth bounds how many hops the graph walks. The caller clamps this to
	// the tool's own 1..5 range before calling; ReadDependencies clamps
	// again as a second line of defense.
	Depth int
}

// MCPDependencyNode is one object in a dependency graph.
type MCPDependencyNode struct {
	// Kind is "table", "view", "routine", "trigger", "index", "constraint",
	// or "sequence".
	Kind string
	Name string
}

// MCPDependencyEdge is one relationship between two nodes.
type MCPDependencyEdge struct {
	From string
	To   string
	// Via is "fk", "view", "trigger", "index", "default", or "ownership".
	Via string
}

// MCPPossibleDependency is a routine whose body mentions the queried
// object's name, found by matching text, not by a real catalog reference
// (PL/pgSQL body references are not recorded in pg_depend). Confidence is
// always "name_match" today; it is a field, not a constant, so a stronger
// signal found later does not need a new field.
type MCPPossibleDependency struct {
	Kind       string
	Name       string
	Confidence string
}

// MCPDependencyGraph is find_dependencies' result.
type MCPDependencyGraph struct {
	Nodes             []MCPDependencyNode
	Edges             []MCPDependencyEdge
	PossiblyDependent []MCPPossibleDependency
	// Truncated is true when the walk stopped at the node cap before it ran
	// out of depth or objects.
	Truncated bool
}

// MCPTableStatsColumn is one column's stored statistic, never a sample
// value: get_table_stats must never return pg_stats.most_common_vals or
// histogram_bounds, since those are real data.
type MCPTableStatsColumn struct {
	Name         string
	NullFraction float64
	NDistinct    float64
	AvgWidth     int
}

// MCPTableStats is get_table_stats' result. EstRows is nil when the table
// has never been analyzed (Postgres has no row count to estimate from yet),
// never a COUNT(*) -- that would scan real data.
type MCPTableStats struct {
	EstRows         *int64
	TableBytes      int64
	IndexBytes      int64
	ToastBytes      int64
	TotalBytes      int64
	LastVacuum      *time.Time
	LastAutovacuum  *time.Time
	LastAnalyze     *time.Time
	LastAutoanalyze *time.Time
	EstDeadTuples   int64
	SeqScans        int64
	IdxScans        int64
	// StatsSince is when the scan counters above started counting. Postgres
	// has no per-table reset timestamp in a portable system view; this is
	// pg_stat_database.stats_reset for the current database, a
	// database-wide proxy, not a per-table one. Said plainly in the tool's
	// own warnings once T2.4 writes them.
	StatsSince     *time.Time
	Partitioned    bool
	PartitionCount int
	Columns        []MCPTableStatsColumn
}

// MCPIndexInfo is one index, for list_indexes. Predicate is a partial
// index's WHERE condition, as Postgres stores it; the caller normalizes its
// literals, IndexReader does not.
type MCPIndexInfo struct {
	Table     string
	Name      string
	Columns   []string
	Unique    bool
	Primary   bool
	Method    string
	Predicate string
	SizeBytes int64
	Scans     int64
	// Valid is false for an index left behind by a failed CREATE INDEX
	// CONCURRENTLY (pg_index.indisvalid).
	Valid bool
	// StatsSince mirrors MCPTableStats.StatsSince: the same database-wide
	// proxy, repeated per index because ReadIndexes' own signature (one
	// port, like the others) returns only a slice, no second value.
	StatsSince *time.Time
}

// MCPColumnDetails is what describe_table adds to a column beyond the
// catalog's name, type, nullability, and primary key. Default is the
// expression as the database stores it; the caller normalizes its literals.
type MCPColumnDetails struct {
	Name       string
	Comment    string
	IsIdentity bool
	Generated  bool
	Default    string
}

// MCPTriggerInfo is a trigger's name and when it fires, never its body.
type MCPTriggerInfo struct {
	Name string
	// Timing is "BEFORE", "AFTER", or "INSTEAD OF".
	Timing string
	// Events are "INSERT", "UPDATE", "DELETE", or "TRUNCATE".
	Events []string
	// ForEachRow is false for a statement-level trigger.
	ForEachRow bool
}

// MCPTableDetails is describe_table's extra facts about one table: comments,
// identity and generated columns, triggers, and partitioning.
type MCPTableDetails struct {
	Comment      string
	Columns      []MCPColumnDetails
	Triggers     []MCPTriggerInfo
	PartitionKey string
	// Partitions lists the direct children of a partitioned table, at most
	// MaxMCPPartitions of them; PartitionCount is the real total.
	Partitions     []string
	PartitionCount int
}

// MaxMCPPartitions caps MCPTableDetails.Partitions.
const MaxMCPPartitions = 100

// MCPReadOnlyColumn is one column of a run_readonly_query result, before
// the app layer masks cell values.
type MCPReadOnlyColumn struct {
	Name string
	Type string
}

// MCPReadOnlyResult is raw rows from a read-only transaction. Values are
// still native scanned types; the app serializes and masks them.
type MCPReadOnlyResult struct {
	Columns   []MCPReadOnlyColumn
	Rows      [][]any
	Truncated bool
	Warnings  []string
}

// MCPReadOnlyQuery is what ReadOnlyRunner runs.
type MCPReadOnlyQuery struct {
	SQL         string
	Params      []any
	MaxRows     int
	Timeout     time.Duration
	LockTimeout time.Duration
	IdleTimeout time.Duration
	Schema      string
}

// MCPDryRunQuery is what DryRunner runs.
type MCPDryRunQuery struct {
	Statements  []string
	Timeout     time.Duration
	LockTimeout time.Duration
	IdleTimeout time.Duration
	Schema      string
}

// MCPDryRunStatement is one statement's dry_run outcome.
type MCPDryRunStatement struct {
	N            int
	Kind         string
	Status       string // ok, error, skipped
	RowsAffected int64
	ElapsedMs    int64
	SQLState     string
	Constraint   string
	Message      string
}

// MCPLockHeld is one lock observed just before rollback.
type MCPLockHeld struct {
	Relation string
	Mode     string
}

// MCPDryRunResult is DryRunner's outcome. RolledBack is true only when
// ROLLBACK was confirmed. RollbackFailed means the caller must treat the
// connection as spent.
type MCPDryRunResult struct {
	Statements     []MCPDryRunStatement
	LocksHeld      []MCPLockHeld
	RolledBack     bool
	RollbackFailed bool
	Caveats        []string
}
