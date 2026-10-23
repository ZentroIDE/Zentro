// SPDX-License-Identifier: GPL-3.0-only

package models

type SchemaDiffSource struct {
	EnvironmentKey string `json:"environmentKey"`
	ProfileName    string `json:"profileName"`
	DatabaseName   string `json:"databaseName"`
	SchemaName     string `json:"schemaName"`
	Label          string `json:"label"`
}

type SchemaTableSnapshot struct {
	Name    string      `json:"name"`
	DDL     string      `json:"ddl"`
	Columns []ColumnDef `json:"columns"`
}

type SchemaIndexSnapshot struct {
	Name      string `json:"name"`
	TableName string `json:"tableName"`
	DDL       string `json:"ddl"`
}

type SchemaConstraintSnapshot struct {
	Name      string `json:"name"`
	TableName string `json:"tableName"`
	Type      string `json:"type"` // e.g., "FOREIGN KEY", "UNIQUE", "CHECK"
	DDL       string `json:"ddl"`
}

type SchemaViewSnapshot struct {
	Name string `json:"name"`
	DDL  string `json:"ddl"`
}

type SchemaRoutineSnapshot struct {
	Name      string `json:"name"`
	Signature string `json:"signature"` // Important for Postgres where routines can be overloaded
	DDL       string `json:"ddl"`
}

type SchemaSnapshot struct {
	Driver         string                     `json:"driver"`
	ProfileName    string                     `json:"profileName"`
	DatabaseName   string                     `json:"databaseName"`
	SchemaName     string                     `json:"schemaName"`
	Label          string                     `json:"label"`
	CapturedAt     string                     `json:"capturedAt"`
	Tables         []SchemaTableSnapshot      `json:"tables"`
	Indexes        []SchemaIndexSnapshot      `json:"indexes"`
	Constraints    []SchemaConstraintSnapshot `json:"constraints"`
	Views          []SchemaViewSnapshot       `json:"views"`
	Routines       []SchemaRoutineSnapshot    `json:"routines"`
	NormalizedDDL  string                     `json:"normalizedDdl"`
	Supported      bool                       `json:"supported"`
	UnsupportedMsg string                     `json:"unsupportedMessage,omitempty"`
}

type SchemaMigrationResult struct {
	Supported          bool     `json:"supported"`
	Driver             string   `json:"driver"`
	Direction          string   `json:"direction"`
	SQL                string   `json:"sql"`
	Warnings           []string `json:"warnings"`
	UnsupportedMessage string   `json:"unsupportedMessage,omitempty"`
}
