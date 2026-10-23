// SPDX-License-Identifier: GPL-3.0-only

package app

// Result-set export, run as an Activity-panel Job (see job_service.go)
// instead of blocking the Wails call until the whole file is written.
// These are methods on *QueryService, not a separate type, because export
// needs the exact same machinery query execution already has — activeQueries,
// prepareExecutor's connection pinning, backendCanceller, and the Job
// plumbing — and duplicating that behind a second service would mean
// injecting the same closures twice for no real separation of concerns.
//
// Pattern: Strategy for the output format (export_writer.go's rowWriter),
// Pipeline for the overall flow: open dialog → start Job → stream rows →
// rename .part to the real path.

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// exportDialogMeta returns the save dialog's title/default filename/filter
// for format ("csv", "json", or anything else, which falls back to csv).
func exportDialogMeta(format string) (title, defaultName, pattern, display string) {
	switch format {
	case "json":
		return "Export JSON", "query_result.json", "*.json", "JSON Files (*.json)"
	case "sql":
		return "Export SQL INSERT", "query_result.sql", "*.sql", "SQL Files (*.sql)"
	default:
		return "Export CSV", "query_result.csv", "*.csv", "CSV Files (*.csv)"
	}
}

// exportSaveDialog opens an OS save dialog for format. filePath=="" (err
// nil) means the user cancelled — callers must not start a Job in that
// case.
func exportSaveDialog(ctx context.Context, format string) (string, error) {
	title, defaultName, pattern, display := exportDialogMeta(format)
	filePath, err := runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultName,
		Filters:         []runtime.FileFilter{{DisplayName: display, Pattern: pattern}},
	})
	if err != nil {
		return "", fmt.Errorf("export: dialog: %w", err)
	}
	return filePath, nil
}

// filterExportColumnIndexes resolves selected (empty = all) against the
// query's actual columns, returning the matching display names and their
// indexes into a raw scanned row — the streaming counterpart of the old
// buffered filterExportColumns, which filtered an already-fetched
// [][]string in one pass instead of one row at a time. Errors (rather than
// silently skipping) on an unknown column, the same contract the old
// buffered version had, and checked once before any row streams so a typo
// never produces a half-written file.
func filterExportColumnIndexes(columns, selected []string) ([]string, []int, error) {
	if len(selected) == 0 {
		indexes := make([]int, len(columns))
		for i := range columns {
			indexes[i] = i
		}
		return columns, indexes, nil
	}
	indexByColumn := make(map[string]int, len(columns))
	for idx, name := range columns {
		if _, exists := indexByColumn[name]; !exists {
			indexByColumn[name] = idx
		}
	}
	filtered := make([]string, 0, len(selected))
	indexes := make([]int, 0, len(selected))
	for _, col := range selected {
		idx, ok := indexByColumn[col]
		if !ok {
			return nil, nil, fmt.Errorf("column %q not found in query result", col)
		}
		filtered = append(filtered, col)
		indexes = append(indexes, idx)
	}
	return filtered, indexes, nil
}

func selectColumns(row []string, indexes []int) []string {
	out := make([]string, len(indexes))
	for i, idx := range indexes {
		if idx >= 0 && idx < len(row) {
			out[i] = row[idx]
		}
	}
	return out
}

// StartExportCSV/JSON/SQLInsert export rows already fetched by the
// frontend ("in view" scope — see docs/plan's export table). columns/rows
// are written as given; the frontend has already filtered them to the
// user's selected columns. Returns a Job id, not a file path — "" with a
// nil error means the user cancelled the save dialog, matching the
// previous file-path-based contract's cancellation signal exactly (the FE
// side doesn't need to change how it detects "cancelled").
func (s *QueryService) StartExportCSV(columns []string, rows [][]string) (string, error) {
	return s.startExport("csv", "", columns, rows, "", 0)
}

func (s *QueryService) StartExportJSON(columns []string, rows [][]string) (string, error) {
	return s.startExport("json", "", columns, rows, "", 0)
}

func (s *QueryService) StartExportSQLInsert(columns []string, rows [][]string, tableName string) (string, error) {
	return s.startExport("sql", tableName, columns, rows, "", 0)
}

// StartExportAllCSV/JSON/SQLInsert re-run tabID's last SELECT and stream
// every row ("all rows" scope), never buffering the full result set the
// way the old ExportAllRows did. knownTotal is the row count the frontend
// already has cached from the result panel's own background COUNT(*)
// (query:count) — passing it through lets the export report real
// percentage progress without running a second COUNT(*) query itself; 0
// means the frontend doesn't have one yet and progress stays indeterminate.
func (s *QueryService) StartExportAllCSV(tabID string, selectedColumns []string, knownTotal int64) (string, error) {
	return s.startExport("csv", "", selectedColumns, nil, tabID, knownTotal)
}

func (s *QueryService) StartExportAllJSON(tabID string, selectedColumns []string, knownTotal int64) (string, error) {
	return s.startExport("json", "", selectedColumns, nil, tabID, knownTotal)
}

func (s *QueryService) StartExportAllSQLInsert(tabID, tableName string, selectedColumns []string, knownTotal int64) (string, error) {
	return s.startExport("sql", tableName, selectedColumns, nil, tabID, knownTotal)
}

// startExport opens the save dialog synchronously — so a cancelled dialog
// never creates a Job — then streams rows to a "<path>.part" file in a
// goroutine tracked as a Job, renaming it to the real path on success and
// removing it on cancel/failure. rows == nil selects the "all rows" scope
// (re-run tabID's last SELECT); a non-nil rows (even empty) is the
// already-fetched "in view" scope and tabID/knownTotal are unused (the
// true total is just len(rows)).
func (s *QueryService) startExport(format, tableName string, columns []string, rows [][]string, tabID string, knownTotal int64) (string, error) {
	filePath, err := exportSaveDialog(s.ctx, format)
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil // user cancelled — no job
	}
	partPath := filePath + ".part"
	allRows := rows == nil

	var parent context.Context = context.Background()
	var jobHandle *JobHandle
	if s.jobs != nil {
		parent, jobHandle = s.jobs.Start(context.Background(), JobSpec{
			Kind:         JobKindExport,
			Title:        fmt.Sprintf("Export → %s", filepath.Base(filePath)),
			ProfileName:  s.jobProfileName(),
			Database:     s.jobDatabase(),
			TabID:        tabID,
			Capabilities: JobCapabilities{Cancel: true},
		})
	}
	ctx, cancel := context.WithCancel(parent)

	jobID := ""
	if jobHandle != nil {
		jobID = jobHandle.ID()
	}

	go func() {
		defer cancel()
		runErr := s.runExport(ctx, format, tableName, columns, rows, allRows, tabID, partPath, knownTotal, jobHandle)
		if runErr != nil {
			_ = os.Remove(partPath)
			if jobHandle != nil {
				jobHandle.Finish(runErr)
			}
			return
		}
		if renameErr := os.Rename(partPath, filePath); renameErr != nil {
			_ = os.Remove(partPath)
			if jobHandle != nil {
				jobHandle.Finish(fmt.Errorf("finalize export file: %w", renameErr))
			}
			return
		}
		if jobHandle != nil {
			jobHandle.SetMeta("filePath", filePath)
			jobHandle.Finish(nil)
		}
	}()

	return jobID, nil
}

// runExport streams rows into partPath. columns/rows/allRows/tabID select
// the scope, same as startExport.
func (s *QueryService) runExport(
	ctx context.Context,
	format, tableName string,
	columns []string, rows [][]string, allRows bool,
	tabID string,
	partPath string,
	knownTotal int64,
	jobHandle *JobHandle,
) (err error) {
	if !allRows {
		return s.runExportInView(ctx, format, tableName, columns, rows, partPath, jobHandle)
	}
	return s.runExportAllRows(ctx, format, tableName, columns, tabID, partPath, knownTotal, jobHandle)
}

// runExportInView writes an already-fetched result set, reporting
// determinate progress (the total is known upfront).
func (s *QueryService) runExportInView(
	ctx context.Context,
	format, tableName string,
	columns []string, rows [][]string,
	partPath string,
	jobHandle *JobHandle,
) (err error) {
	writer, werr := newRowWriter(format, partPath, tableName)
	if werr != nil {
		return fmt.Errorf("export: create file: %w", werr)
	}
	defer func() {
		if closeErr := writer.Close(); err == nil {
			err = closeErr
		}
	}()

	if err := writer.WriteHeader(columns); err != nil {
		return fmt.Errorf("export: write header: %w", err)
	}
	total := int64(len(rows))
	for i, row := range rows {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := writer.WriteRow(row); err != nil {
			return fmt.Errorf("export: write row: %w", err)
		}
		if jobHandle != nil {
			jobHandle.Report(int64(i+1), total, JobProgressUnitRows, "")
		}
	}
	return nil
}

// runExportAllRows re-runs tabID's last SELECT and streams the live result
// set. Progress is determinate when knownTotal > 0 — the caller's own
// already-cached COUNT(*) (see StartExportAllCSV). When the caller doesn't
// have one yet (the result panel's own background count hadn't landed
// before the user hit Start export), this runs its own best-effort
// COUNT(*) on the same pinned connection before streaming, rather than
// leaving the whole export indeterminate — accurate progress matters more
// here than the one extra round trip, since an all-rows export is already
// a multi-row-million-row operation by the time it's worth watching.
// When the active driver implements BackendCanceller, it pins a
// connection, captures its backend id, and registers a kill func so Force
// kill can terminate the server-side session, the same as a query Job.
func (s *QueryService) runExportAllRows(
	ctx context.Context,
	format, tableName string,
	selectedColumns []string,
	tabID string,
	partPath string,
	knownTotal int64,
	jobHandle *JobHandle,
) (err error) {
	s.activeQueriesMu.RLock()
	query, ok := s.activeQueries[tabID]
	s.activeQueriesMu.RUnlock()
	if !ok || strings.TrimSpace(query) == "" {
		return fmt.Errorf("no active query found for export")
	}

	executor := s.getExecutor()
	if !isExecutorReady(executor) {
		return fmt.Errorf("no active connection")
	}

	statementExecutor, releaseExecutor, prepErr := s.prepareExecutor(ctx, executor)
	if prepErr != nil {
		return fmt.Errorf("export: prepare query context: %w", prepErr)
	}
	defer releaseExecutor()

	if conn, ok := statementExecutor.(*sql.Conn); ok {
		s.registerExportKill(ctx, conn, jobHandle)
	}

	total := knownTotal
	if total <= 0 {
		total = s.bestEffortRowCount(ctx, statementExecutor, query)
	}

	rowsResult, err := statementExecutor.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("export: query failed: %w", err)
	}
	defer rowsResult.Close()

	cols, err := rowsResult.Columns()
	if err != nil {
		return fmt.Errorf("export: columns error: %w", err)
	}
	filteredCols, colIndexes, err := filterExportColumnIndexes(cols, selectedColumns)
	if err != nil {
		return err
	}

	writer, werr := newRowWriter(format, partPath, tableName)
	if werr != nil {
		return fmt.Errorf("export: create file: %w", werr)
	}
	defer func() {
		if closeErr := writer.Close(); err == nil {
			err = closeErr
		}
	}()

	if err := writer.WriteHeader(filteredCols); err != nil {
		return fmt.Errorf("export: write header: %w", err)
	}

	colCount := len(cols)
	dbTypes := databaseTypeNames(rowsResult)
	var written int64
	for rowsResult.Next() {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		raw := scanRowAsStrings(rowsResult, colCount, dbTypes)
		if err := writer.WriteRow(selectColumns(raw, colIndexes)); err != nil {
			return fmt.Errorf("export: write row: %w", err)
		}
		written++
		if jobHandle != nil {
			// detail="" (not "N rows") so the Activity panel's own
			// "done / total rows" caption renders instead of a flat
			// repeat of the row count with no total — same as
			// runExportInView's Report call.
			jobHandle.Report(written, total, JobProgressUnitRows, "")
		}
	}
	if err := rowsResult.Err(); err != nil {
		return fmt.Errorf("export: row iteration failed: %w", err)
	}
	return nil
}

// bestEffortRowCount wraps query in a COUNT(*) and runs it on executor —
// the same pinned connection an export-all-rows is about to stream from —
// so a real total is available even when the caller didn't already have
// one cached. Mirrors query_execution.go's countQueryRows exactly (same
// "/* trailing semicolon trimmed */ AS _zentro_count" wrapper), but runs
// synchronously, inline, before streaming starts, rather than async after
// the fact. A failure here is logged and treated as "stay indeterminate",
// never as a reason to fail the export itself.
func (s *QueryService) bestEffortRowCount(ctx context.Context, executor sqlExecutor, query string) int64 {
	trimmed := strings.TrimRight(strings.TrimSpace(query), ";")
	countQuery := "SELECT COUNT(*) FROM (" + trimmed + ") AS _zentro_count"
	var count int64
	if err := executor.QueryRowContext(ctx, countQuery).Scan(&count); err != nil {
		s.logger.Debug("export: best-effort row count failed", "err", err)
		return 0
	}
	return count
}

// registerExportKill captures conn's backend id (best-effort — a failure
// here only means Force kill won't be available for this export) and
// registers a kill func that force-terminates it on the server.
func (s *QueryService) registerExportKill(ctx context.Context, conn *sql.Conn, jobHandle *JobHandle) {
	canceller := s.backendCanceller()
	if canceller == nil || jobHandle == nil {
		return
	}
	id, err := canceller.BackendID(ctx, conn)
	if err != nil {
		s.logger.Warn("read backend id failed", "err", err)
		return
	}
	jobHandle.SetBackendID(id)
	jobHandle.SetKillFunc(func(killCtx context.Context) error {
		return canceller.CancelBackend(killCtx, s.getDB(), id, true)
	})
}
