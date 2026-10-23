// SPDX-License-Identifier: GPL-3.0-only

package models

// ColumnDef holds the schema information for a single column.
type ColumnDef struct {
	Name               string `json:"Name"`
	DataType           string `json:"DataType"`
	FullDataType       string `json:"FullDataType,omitempty"` // type with length/precision, e.g. varchar(50), decimal(17,2)
	Description        string `json:"Description,omitempty"`  // column comment/description if available
	IsPrimaryKey       bool   `json:"IsPrimaryKey"`
	IsNullable         bool   `json:"IsNullable"`
	DefaultValue       string `json:"DefaultValue"`
	GenerationKind     string `json:"GenerationKind,omitempty"` // e.g. "", "identity", "sequence"
	IdentityGeneration string `json:"IdentityGeneration,omitempty"`
	SequenceSchema     string `json:"SequenceSchema,omitempty"`
	SequenceName       string `json:"SequenceName,omitempty"`
}

// TableRelationship represents a foreign key constraint between two tables.
// It can be outgoing (SourceTable = current table) or incoming (TargetTable = current table).
type TableRelationship struct {
	ConstraintName string `json:"ConstraintName"`
	SourceSchema   string `json:"SourceSchema"`
	SourceTable    string `json:"SourceTable"`
	SourceColumn   string `json:"SourceColumn"`
	TargetSchema   string `json:"TargetSchema"`
	TargetTable    string `json:"TargetTable"`
	TargetColumn   string `json:"TargetColumn"`
	OnDelete       string `json:"OnDelete"`
	OnUpdate       string `json:"OnUpdate"`
	// Deferrable is nil when the driver does not report it (only Postgres
	// does today).
	Deferrable *bool `json:"Deferrable,omitempty"`
}

// ReferencingRowsProbe asks whether a child table still has rows whose
// foreign-key columns match any of the given key tuples, i.e. whether deleting
// the parent rows those keys came from would actually run into the constraint.
type ReferencingRowsProbe struct {
	// Key is an opaque id echoed back on the result so callers can match them.
	Key    string `json:"Key"`
	Schema string `json:"Schema"`
	Table  string `json:"Table"`
	// Columns are the child table's foreign-key columns.
	Columns []string `json:"Columns"`
	// Keys are the parent key values, one tuple per parent row, each aligned
	// to Columns. Passed to the database as bound parameters.
	Keys [][]string `json:"Keys"`
}

// ReferencingRowsResult is the answer for one ReferencingRowsProbe.
type ReferencingRowsResult struct {
	Key string `json:"Key"`
	// Count is how many child rows reference the keys, capped at the probe
	// limit (see HasMore).
	Count   int64 `json:"Count"`
	HasMore bool  `json:"HasMore"`
	// Verified is false when the answer could not be worked out (too many
	// keys to probe, or the query failed); Count is then meaningless and
	// callers should assume the rows may be referenced.
	Verified bool   `json:"Verified"`
	Error    string `json:"Error,omitempty"`
}

// DatabaseInfo represents a database and its schemas.
type DatabaseInfo struct {
	Name    string
	Schemas []*SchemaNode
}

// SchemaNode represents a schema and all its object categories.
// Every slice is initialized as []string{} (never nil) so JSON serializes as [] not null.
type SchemaNode struct {
	Name               string   `json:"Name"`
	Tables             []string `json:"Tables"`
	ForeignTables      []string `json:"ForeignTables"`
	Views              []string `json:"Views"`
	MaterializedViews  []string `json:"MaterializedViews"`
	Indexes            []string `json:"Indexes"`
	Functions          []string `json:"Functions"`
	Procedures         []string `json:"Procedures"`
	Sequences          []string `json:"Sequences"`
	DataTypes          []string `json:"DataTypes"`
	AggregateFunctions []string `json:"AggregateFunctions"`
}

// NewSchemaNode returns a SchemaNode with all slices initialized to empty (not nil).
func NewSchemaNode(name string) *SchemaNode {
	return &SchemaNode{
		Name:               name,
		Tables:             []string{},
		ForeignTables:      []string{},
		Views:              []string{},
		MaterializedViews:  []string{},
		Indexes:            []string{},
		Functions:          []string{},
		Procedures:         []string{},
		Sequences:          []string{},
		DataTypes:          []string{},
		AggregateFunctions: []string{},
	}
}
