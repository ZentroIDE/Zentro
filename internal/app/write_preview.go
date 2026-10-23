// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"zentro/internal/constant"
	dbpkg "zentro/internal/db"
)

// This file owns the whole "preview what a write statement would do" surface:
// parsing the statement, running it inside a rollback-only sandbox
// transaction, the one-shot affected-row count, and the paginated preview
// session. query_preflight.go calls into PreviewAffectedRows for the summary
// field it embeds in QueryPreflightResult; it does not duplicate any of this
// parsing or transaction logic itself.

const (
	writePreviewBatchSize = 100
	writePreviewTTL       = 10 * time.Minute
	maxWritePreviewRows   = 1000
)

var (
	deletePreviewPattern       = regexp.MustCompile(`(?is)^\s*delete\s+from\s+([a-zA-Z0-9_."\[\]]+)(?:\s+where\s+(.+))?\s*$`)
	updatePreviewPattern       = regexp.MustCompile(`(?is)^\s*update\s+([a-zA-Z0-9_."\[\]]+)\s+set\s+(.+?)(?:\s+where\s+(.+))?\s*$`)
	statementLeadingCommentPat = regexp.MustCompile(`(?is)\A(?:\s+|--[^\n]*(?:\n|$)|/\*.*?\*/)*`)
)

type QueryPreviewResult struct {
	Supported        bool       `json:"supported"`
	AffectedRowCount int64      `json:"affected_row_count"`
	CountKnown       bool       `json:"count_known"`
	Columns          []string   `json:"columns,omitempty"`
	Rows             [][]string `json:"rows,omitempty"`
	FallbackReason   string     `json:"fallback_reason,omitempty"`
}

type WritePreviewSession struct {
	ID         string
	TableName  string
	Columns    []string
	Rows       [][]string
	TotalCount int64
	CreatedAt  time.Time
	LastUsedAt time.Time
}

type WritePreviewPage struct {
	Columns    []string   `json:"columns"`
	Rows       [][]string `json:"rows"`
	HasMore    bool       `json:"has_more"`
	TotalCount int64      `json:"total_count"`
	TableName  string     `json:"table_name,omitempty"`
}

type OpenWritePreviewResult struct {
	PreviewSessionID     string           `json:"preview_session_id"`
	PreviewTabQueryLabel string           `json:"preview_tab_query_label"`
	InitialResultMeta    WritePreviewPage `json:"initial_result_meta"`
}

type previewStatement struct {
	statementText string
	operation     string
	tableExpr     string
	setExpr       string
	whereExpr     string
}

// PreviewAffectedRows returns a COUNT(*) of the rows a simple UPDATE/DELETE
// query would touch, run inside a rollback-only sandbox transaction.
func (a *App) PreviewAffectedRows(query string, environmentKey string) (QueryPreviewResult, error) {
	if !strings.EqualFold(strings.TrimSpace(a.currentDriver()), constant.DriverPostgres) {
		return QueryPreviewResult{Supported: false, FallbackReason: "preview is currently supported for PostgreSQL only"}, nil
	}
	statements := dbpkg.SplitStatements(query)
	tx, cleanup, err := a.beginPreviewTransaction()
	if err != nil {
		return QueryPreviewResult{}, err
	}
	defer cleanup()

	var totalCount int64
	counted := 0
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		parsed, parseErr := parsePreviewStatement(stmt)
		if parseErr != nil {
			continue
		}
		countSQL := "SELECT COUNT(*) FROM " + parsed.tableExpr
		if parsed.whereExpr != "" {
			countSQL += " WHERE " + parsed.whereExpr
		}
		var n int64
		if scanErr := tx.QueryRowContext(context.Background(), countSQL).Scan(&n); scanErr != nil {
			continue
		}
		totalCount += n
		counted++
	}
	if counted == 0 {
		return QueryPreviewResult{Supported: false, FallbackReason: "no countable statements found"}, nil
	}
	return QueryPreviewResult{
		Supported:        true,
		AffectedRowCount: totalCount,
		CountKnown:       true,
	}, nil
}

// collectSandboxPreviewRows parses each statement in query, runs it inside
// tx as a rollback-only sandbox preview (RETURNING * for UPDATE, SELECT for
// DELETE), and returns up to limit combined rows plus the table name and
// operation of the first previewable statement. Per-statement parse/exec
// errors are skipped rather than surfaced, matching preview's best-effort
// contract.
func collectSandboxPreviewRows(tx *sql.Tx, query string, limit int) (columns []string, rows [][]string, tableName string, firstOp string) {
	for _, stmt := range dbpkg.SplitStatements(query) {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || len(rows) >= limit {
			continue
		}
		parsed, parseErr := parsePreviewStatement(stmt)
		if parseErr != nil {
			continue
		}
		if tableName == "" {
			tableName = strings.TrimSpace(parsed.tableExpr)
			firstOp = parsed.operation
		}
		remaining := limit - len(rows)
		var partial QueryPreviewResult
		var err error
		if parsed.operation == "update" {
			partial, err = previewSandboxUpdatedRows(tx, parsed.statementText, remaining)
		} else {
			partial, err = previewSandboxDeletedRows(tx, parsed, remaining)
		}
		if err != nil || !partial.Supported || len(partial.Rows) == 0 {
			continue
		}
		if columns == nil {
			columns = partial.Columns
		}
		rows = append(rows, partial.Rows...)
	}
	return columns, rows, tableName, firstOp
}

func previewSandboxDeletedRows(tx *sql.Tx, stmt previewStatement, limit int) (QueryPreviewResult, error) {
	selectSQL := "SELECT * FROM " + stmt.tableExpr
	if stmt.whereExpr != "" {
		selectSQL += " WHERE " + stmt.whereExpr
	}
	selectSQL += fmt.Sprintf(" LIMIT %d", limit)
	rows, err := tx.QueryContext(context.Background(), selectSQL)
	if err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	dbTypes := databaseTypeNames(rows)
	rowData := make([][]string, 0, limit)
	for rows.Next() {
		rowData = append(rowData, scanRowAsStrings(rows, len(columns), dbTypes))
	}
	if err := rows.Err(); err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	return QueryPreviewResult{Supported: true, Columns: columns, Rows: rowData}, nil
}

func previewSandboxUpdatedRows(tx *sql.Tx, statement string, limit int) (QueryPreviewResult, error) {
	trimmed := strings.TrimSpace(statement)
	trimmed = strings.TrimSuffix(trimmed, ";")
	rows, err := tx.QueryContext(
		context.Background(),
		fmt.Sprintf("%s RETURNING *", trimmed),
	)
	if err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	dbTypes := databaseTypeNames(rows)
	rowData := make([][]string, 0, limit)
	for rows.Next() {
		if len(rowData) >= limit {
			break
		}
		rowData = append(rowData, scanRowAsStrings(rows, len(columns), dbTypes))
	}
	if err := rows.Err(); err != nil {
		return QueryPreviewResult{Supported: false, FallbackReason: err.Error()}, nil
	}
	return QueryPreviewResult{
		Supported: true,
		Columns:   columns,
		Rows:      rowData,
	}, nil
}

func parsePreviewStatement(statement string) (previewStatement, error) {
	statement = strings.TrimSpace(statementLeadingCommentPat.ReplaceAllString(statement, ""))
	if matches := deletePreviewPattern.FindStringSubmatch(statement); len(matches) == 3 {
		return previewStatement{
			statementText: statement,
			operation:     "delete",
			tableExpr:     strings.TrimSpace(matches[1]),
			whereExpr:     strings.TrimSpace(matches[2]),
		}, nil
	}
	if strings.Contains(strings.ToLower(statement), " returning ") || strings.Contains(strings.ToLower(statement), " from ") {
		return previewStatement{}, fmt.Errorf("complex UPDATE previews are not supported yet")
	}
	if matches := updatePreviewPattern.FindStringSubmatch(statement); len(matches) == 4 {
		return previewStatement{
			statementText: statement,
			operation:     "update",
			tableExpr:     strings.TrimSpace(matches[1]),
			setExpr:       strings.TrimSpace(matches[2]),
			whereExpr:     strings.TrimSpace(matches[3]),
		}, nil
	}
	return previewStatement{}, fmt.Errorf("preview supports simple UPDATE or DELETE statements only")
}

func firstPreviewStatement(query string, driver string) (previewStatement, error) {
	if !strings.EqualFold(strings.TrimSpace(driver), constant.DriverPostgres) {
		return previewStatement{}, fmt.Errorf("preview is currently supported for PostgreSQL only")
	}
	statements := dbpkg.SplitStatements(query)
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if parsed, err := parsePreviewStatement(stmt); err == nil {
			return parsed, nil
		}
	}
	return previewStatement{}, fmt.Errorf("no previewable UPDATE or DELETE statement found")
}

// OpenWritePreview opens a paginated preview session for a write query,
// backed by the same rollback-only sandbox transaction and statement parsing
// as PreviewAffectedRows, but keeps all matched rows (up to maxWritePreviewRows)
// resident for later paginated fetches via FetchWritePreviewRows.
func (a *App) OpenWritePreview(query string, environmentKey string) (OpenWritePreviewResult, error) {
	_ = environmentKey
	a.cleanupExpiredWritePreviews()

	if !strings.EqualFold(strings.TrimSpace(a.currentDriver()), constant.DriverPostgres) {
		return OpenWritePreviewResult{}, fmt.Errorf("preview is currently supported for PostgreSQL only")
	}

	tx, cleanup, err := a.beginPreviewTransaction()
	if err != nil {
		return OpenWritePreviewResult{}, err
	}
	defer cleanup()

	columns, allRows, tableName, firstOp := collectSandboxPreviewRows(tx, query, maxWritePreviewRows)
	if columns == nil {
		return OpenWritePreviewResult{}, fmt.Errorf("no previewable UPDATE or DELETE statements found")
	}

	total := int64(len(allRows))
	initialRows := allRows
	hasMore := false
	if len(allRows) > writePreviewBatchSize {
		initialRows = allRows[:writePreviewBatchSize]
		hasMore = true
	}

	sessionID := strings.ReplaceAll(fmt.Sprintf("wp_%d", time.Now().UnixNano()), "-", "_")
	session := &WritePreviewSession{
		ID:         sessionID,
		TableName:  tableName,
		Columns:    columns,
		Rows:       allRows,
		TotalCount: total,
		CreatedAt:  time.Now().UTC(),
		LastUsedAt: time.Now().UTC(),
	}

	a.writePreviewMu.Lock()
	a.writePreviews[sessionID] = session
	a.writePreviewMu.Unlock()

	return OpenWritePreviewResult{
		PreviewSessionID:     sessionID,
		PreviewTabQueryLabel: fmt.Sprintf("Preview %s", strings.ToUpper(firstOp)),
		InitialResultMeta: WritePreviewPage{
			Columns:    columns,
			Rows:       initialRows,
			HasMore:    hasMore,
			TotalCount: total,
			TableName:  tableName,
		},
	}, nil
}

func (a *App) FetchWritePreviewRows(previewSessionID string, offset int, limit int) (WritePreviewPage, error) {
	a.cleanupExpiredWritePreviews()

	session, err := a.getWritePreviewSession(previewSessionID)
	if err != nil {
		return WritePreviewPage{}, err
	}
	if limit <= 0 {
		limit = writePreviewBatchSize
	}

	rows := session.Rows
	end := offset + limit
	if offset > len(rows) {
		offset = len(rows)
	}
	if end > len(rows) {
		end = len(rows)
	}

	a.writePreviewMu.Lock()
	session.LastUsedAt = time.Now().UTC()
	a.writePreviewMu.Unlock()

	return WritePreviewPage{
		Columns:    session.Columns,
		Rows:       rows[offset:end],
		HasMore:    end < len(rows),
		TotalCount: session.TotalCount,
		TableName:  session.TableName,
	}, nil
}

func (a *App) CloseWritePreview(previewSessionID string) error {
	a.writePreviewMu.Lock()
	delete(a.writePreviews, previewSessionID)
	a.writePreviewMu.Unlock()
	return nil
}

func (a *App) getWritePreviewSession(previewSessionID string) (*WritePreviewSession, error) {
	a.writePreviewMu.Lock()
	defer a.writePreviewMu.Unlock()

	session, ok := a.writePreviews[previewSessionID]
	if !ok {
		return nil, fmt.Errorf("write preview session not found")
	}
	return session, nil
}

func (a *App) cleanupExpiredWritePreviews() {
	now := time.Now().UTC()

	a.writePreviewMu.Lock()
	for id, session := range a.writePreviews {
		if now.Sub(session.LastUsedAt) > writePreviewTTL {
			delete(a.writePreviews, id)
		}
	}
	a.writePreviewMu.Unlock()
}

func (a *App) closeAllWritePreviews() {
	a.writePreviewMu.Lock()
	clear(a.writePreviews)
	a.writePreviewMu.Unlock()
}

func (a *App) beginPreviewTransaction() (*sql.Tx, func(), error) {
	if a.db == nil {
		return nil, nil, fmt.Errorf("no active connection")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		cancel()
		return nil, nil, err
	}
	if a.svc.Query != nil {
		if err := a.svc.Query.applySessionContext(ctx, tx); err != nil {
			_ = tx.Rollback()
			cancel()
			return nil, nil, err
		}
	}
	return tx, func() {
		_ = tx.Rollback()
		cancel()
	}, nil
}
