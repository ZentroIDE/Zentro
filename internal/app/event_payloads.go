// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

type ConnectionRuntimeState struct {
	Profile *models.ConnectionProfile `json:"profile,omitempty"`
	Status  string                    `json:"status"`
}

type ConnectionChangedEvent struct {
	Profile *models.ConnectionProfile `json:"profile,omitempty"`
	Status  string                    `json:"status"`
}

// ConnectionUpdatedEvent notifies the frontend that a saved connection
// profile's fields changed (e.g. edited in Settings > Connections), as
// opposed to ConnectionChangedEvent which tracks connect/disconnect
// lifecycle. The frontend uses Profile.ID to refresh any in-memory
// snapshot of this profile (e.g. the toolbar's active-connection display)
// still holding stale values.
type ConnectionUpdatedEvent struct {
	Profile *models.ConnectionProfile `json:"profile"`
}

type SchemaDatabasesEvent struct {
	ProfileName string   `json:"profileName"`
	Databases   []string `json:"databases"`
}

type SchemaErrorEvent struct {
	ProfileName string `json:"profileName"`
	DBName      string `json:"dbName"`
	Error       string `json:"error"`
}

type SchemaLoadedEvent struct {
	ProfileName string               `json:"profileName"`
	DBName      string               `json:"dbName"`
	Schemas     []*models.SchemaNode `json:"schemas"`
}

type QueryStartedEvent struct {
	TabID          string `json:"tabID"`
	SourceTabID    string `json:"sourceTabID"`
	Query          string `json:"query"`
	StatementText  string `json:"statementText"`
	StatementIndex int    `json:"statementIndex"`
	StatementCount int    `json:"statementCount"`
}

type QueryChunkEvent struct {
	TabID          string     `json:"tabID"`
	SourceTabID    string     `json:"sourceTabID"`
	Columns        []string   `json:"columns,omitempty"`
	Rows           [][]string `json:"rows"`
	Seq            int        `json:"seq"`
	StatementIndex int        `json:"statementIndex"`
	StatementCount int        `json:"statementCount"`
	StatementText  string     `json:"statementText"`
	TableName      string     `json:"tableName,omitempty"`
	PrimaryKeys    []string   `json:"primaryKeys,omitempty"`
}

type QueryDoneEvent struct {
	TabID          string `json:"tabID"`
	SourceTabID    string `json:"sourceTabID"`
	Affected       int64  `json:"affected"`
	Duration       int64  `json:"duration"`
	IsSelect       bool   `json:"isSelect"`
	HasMore        bool   `json:"hasMore"`
	StatementIndex int    `json:"statementIndex"`
	StatementCount int    `json:"statementCount"`
	StatementText  string `json:"statementText"`
	Error          string `json:"error,omitempty"`
}

// QueryTransactionSummaryEvent carries aggregate row counts across every
// statement actually executed in a multi-statement run, emitted once at the
// terminal point (last statement, error, or cancellation) regardless of how
// many individual QueryStartedEvent/QueryDoneEvent pairs were throttled.
type QueryTransactionSummaryEvent struct {
	SourceTabID  string `json:"sourceTabID"`
	InsertedRows int64  `json:"insertedRows"`
	UpdatedRows  int64  `json:"updatedRows"`
	DeletedRows  int64  `json:"deletedRows"`
	// StatementCount and Query describe the whole run, so the frontend can
	// show one execution summary even though most statements' own
	// started/done events were throttled away.
	StatementCount int    `json:"statementCount"`
	Query          string `json:"query"`
}

type TransactionStatusEvent struct {
	Status string `json:"status"`
	Driver string `json:"driver"`
	Error  string `json:"error,omitempty"`
}

type QueryCountEvent struct {
	TabID string `json:"tabID"`
	Count int64  `json:"count"`
}

// QueryMessageEvent carries one server-side informational message (T-SQL
// PRINT / low-severity RAISERROR) captured while a statement executed.
type QueryMessageEvent struct {
	SourceTabID string `json:"sourceTabID"`
	TabID       string `json:"tabID"`
	Text        string `json:"text"`
}

type QueryRangeEvent struct {
	TabID  string     `json:"tabID"`
	Offset int        `json:"offset"`
	Rows   [][]string `json:"rows"`
	Error  string     `json:"error,omitempty"`
}

// JobRemovedEvent tells the frontend to drop a job it previously saw via
// EventJobUpdated. See job_service.go.
type JobRemovedEvent struct {
	ID string `json:"id"`
}
