// SPDX-License-Identifier: GPL-3.0-only

package app

// CSV → table import, run as an Activity-panel Job (see job_service.go).
// Methods on *QueryService for the same reason export_service.go's are:
// import needs the exact same driver/db/job access query execution and
// export already have, so a separate type would mean injecting the same
// closures a third time.
//
// Cancellation is ctx-only here — unlike a query or an all-rows export,
// an import's connection is ours alone for the run (never shared with a
// server-visible session a user might want to force-kill from outside),
// so there is nothing for BackendCanceller to target; a ctx cancel plus a
// transaction rollback (when SingleTransaction is on) is the whole story.

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"zentro/internal/constant"
	driverport "zentro/internal/driver"
)

// ImportColumnMapping maps one CSV column to a target table column. An
// empty TargetColumn means the CSV column is skipped.
type ImportColumnMapping struct {
	SourceColumn string `json:"sourceColumn"`
	TargetColumn string `json:"targetColumn"`
}

// CSVImportOptions configures one CSV → table import run (StartCSVImport).
type CSVImportOptions struct {
	FilePath          string                `json:"filePath"`
	Delimiter         string                `json:"delimiter"` // "", ",", ";", "\t", "|", or any single character
	HasHeader         bool                  `json:"hasHeader"`
	Schema            string                `json:"schema"`
	Table             string                `json:"table"`
	Mappings          []ImportColumnMapping `json:"mappings"`
	NullToken         string                `json:"nullToken"`
	TrimWhitespace    bool                  `json:"trimWhitespace"`
	BatchSize         int                   `json:"batchSize"`
	OnError           string                `json:"onError"` // "abort" (default) | "skip"
	SingleTransaction bool                  `json:"singleTransaction"`
	TruncateFirst     bool                  `json:"truncateFirst"`
}

// CSVImportPreview is previewCSVImport's result — the File and Mapping
// steps of the import wizard's data.
type CSVImportPreview struct {
	Columns       []string   `json:"columns"`
	SampleRows    [][]string `json:"sampleRows"`
	InferredTypes []string   `json:"inferredTypes"`
	FileSizeBytes int64      `json:"fileSizeBytes"`
}

const csvPreviewSampleRows = 50

// defaultImportBatchSize matches the plan's wizard default; also used
// whenever the caller passes <= 0.
const defaultImportBatchSize = 1000

// parseDelimiter accepts the empty string (meaning comma), any of the
// wizard's presets, or a literal single character.
func parseDelimiter(d string) (rune, error) {
	switch d {
	case "", ",":
		return ',', nil
	case ";":
		return ';', nil
	case "\t":
		return '\t', nil
	case "|":
		return '|', nil
	}
	r := []rune(d)
	if len(r) != 1 {
		return 0, fmt.Errorf("delimiter must be a single character, got %q", d)
	}
	return r[0], nil
}

// syntheticColumnName is the placeholder header previewCSVImport/runImport
// use for a column when the file has no header row — row index N (1-based)
// becomes "column_N" on both sides, so a mapping built from the preview
// still resolves correctly during the real import.
func syntheticColumnName(index1Based int) string {
	return fmt.Sprintf("column_%d", index1Based)
}

func parseSyntheticColumnIndex(name string) (int, bool) {
	const prefix = "column_"
	if !strings.HasPrefix(name, prefix) {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimPrefix(name, prefix))
	if err != nil || n < 1 {
		return 0, false
	}
	return n - 1, true
}

// previewCSVImport reads filePath's header (if any) and up to
// csvPreviewSampleRows data rows, inferring a simple type per column from
// the sample. It never touches a database connection.
func previewCSVImport(filePath, delimiter string, hasHeader bool) (CSVImportPreview, error) {
	delim, err := parseDelimiter(delimiter)
	if err != nil {
		return CSVImportPreview{}, err
	}

	f, err := os.Open(filePath)
	if err != nil {
		return CSVImportPreview{}, fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return CSVImportPreview{}, fmt.Errorf("stat file: %w", err)
	}

	reader := csv.NewReader(bufio.NewReader(f))
	reader.Comma = delim
	reader.FieldsPerRecord = -1 // tolerate ragged rows in the preview

	var columns []string
	if hasHeader {
		header, herr := reader.Read()
		if herr != nil && herr != io.EOF {
			return CSVImportPreview{}, fmt.Errorf("read header: %w", herr)
		}
		columns = header
	}

	var sample [][]string
	for len(sample) < csvPreviewSampleRows {
		row, rerr := reader.Read()
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return CSVImportPreview{}, fmt.Errorf("read row %d: %w", len(sample)+1, rerr)
		}
		sample = append(sample, row)
	}

	if len(columns) == 0 && len(sample) > 0 {
		columns = make([]string, len(sample[0]))
		for i := range columns {
			columns[i] = syntheticColumnName(i + 1)
		}
	}

	return CSVImportPreview{
		Columns:       columns,
		SampleRows:    sample,
		InferredTypes: inferColumnTypes(columns, sample),
		FileSizeBytes: info.Size(),
	}, nil
}

// inferColumnTypes classifies each column as "integer", "numeric",
// "boolean", or "text" from the sample — a hint for the wizard's Mapping
// step, not a schema the import itself enforces (every value is still sent
// to the driver as a string or nil; the target column's own type decides
// how the server stores it).
func inferColumnTypes(columns []string, sample [][]string) []string {
	types := make([]string, len(columns))
	for colIdx := range columns {
		sawInt, sawFloat, sawBool, sawAny := true, true, true, false
		for _, row := range sample {
			if colIdx >= len(row) {
				continue
			}
			v := strings.TrimSpace(row[colIdx])
			if v == "" {
				continue
			}
			sawAny = true
			if _, err := strconv.ParseInt(v, 10, 64); err != nil {
				sawInt = false
			}
			if _, err := strconv.ParseFloat(v, 64); err != nil {
				sawFloat = false
			}
			lower := strings.ToLower(v)
			if lower != "true" && lower != "false" {
				sawBool = false
			}
		}
		switch {
		case !sawAny:
			types[colIdx] = "text"
		case sawInt:
			types[colIdx] = "integer"
		case sawFloat:
			types[colIdx] = "numeric"
		case sawBool:
			types[colIdx] = "boolean"
		default:
			types[colIdx] = "text"
		}
	}
	return types
}

// validateImportOptions checks what previewCSVImport/the wizard can't
// already guarantee by construction.
func validateImportOptions(opts CSVImportOptions) error {
	if strings.TrimSpace(opts.FilePath) == "" {
		return fmt.Errorf("file path is required")
	}
	if strings.TrimSpace(opts.Table) == "" {
		return fmt.Errorf("target table is required")
	}
	if opts.OnError != "" && opts.OnError != "abort" && opts.OnError != "skip" {
		return fmt.Errorf("invalid onError value %q", opts.OnError)
	}
	for _, m := range opts.Mappings {
		if strings.TrimSpace(m.TargetColumn) != "" {
			return nil
		}
	}
	return fmt.Errorf("at least one column must be mapped")
}

// resolveImportMapping turns the wizard's name-based mapping into ordered
// target columns plus the CSV field index that feeds each one. sourceColumns
// is the real header when the file has one; otherwise a mapping's
// SourceColumn is expected to be a syntheticColumnName and is resolved
// positionally instead.
func resolveImportMapping(sourceColumns []string, mappings []ImportColumnMapping) ([]string, []int, error) {
	indexByName := make(map[string]int, len(sourceColumns))
	for i, name := range sourceColumns {
		if _, exists := indexByName[name]; !exists {
			indexByName[name] = i
		}
	}

	targetColumns := make([]string, 0, len(mappings))
	sourceIndexes := make([]int, 0, len(mappings))
	for _, m := range mappings {
		if strings.TrimSpace(m.TargetColumn) == "" {
			continue
		}
		idx, ok := indexByName[m.SourceColumn]
		if !ok {
			idx, ok = parseSyntheticColumnIndex(m.SourceColumn)
		}
		if !ok {
			return nil, nil, fmt.Errorf("source column %q not found", m.SourceColumn)
		}
		targetColumns = append(targetColumns, m.TargetColumn)
		sourceIndexes = append(sourceIndexes, idx)
	}
	if len(targetColumns) == 0 {
		return nil, nil, fmt.Errorf("at least one column must be mapped")
	}
	return targetColumns, sourceIndexes, nil
}

// rowValues extracts the mapped fields from one CSV row, in target-column
// order, substituting nil for any field equal to opts.NullToken.
func rowValues(row []string, sourceIndexes []int, opts CSVImportOptions) []any {
	values := make([]any, len(sourceIndexes))
	for i, idx := range sourceIndexes {
		var raw string
		if idx < len(row) {
			raw = row[idx]
		}
		if opts.TrimWhitespace {
			raw = strings.TrimSpace(raw)
		}
		if raw == opts.NullToken {
			values[i] = nil
		} else {
			values[i] = raw
		}
	}
	return values
}

// bindMarkerFor returns the positional bind-parameter marker for
// driverName — the same per-dialect difference internal/driver/
// referencing_rows.go's callers already thread through explicitly
// (see CountReferencingRowsWith's call sites) rather than a DatabaseDriver
// method, since it's a one-line syntax difference, not real per-driver
// behavior.
func bindMarkerFor(driverName string) driverport.BindMarker {
	switch driverName {
	case constant.DriverPostgres:
		return func(n int) string { return fmt.Sprintf("$%d", n) }
	case constant.DriverSQLServer:
		return func(n int) string { return fmt.Sprintf("@p%d", n) }
	default: // MySQL, SQLite
		return func(int) string { return "?" }
	}
}

func qualifyTableName(dialect driverport.QueryDialect, schema, table string) string {
	qTable := dialect.QuoteIdentifier(table)
	if strings.TrimSpace(schema) == "" {
		return qTable
	}
	return dialect.QuoteIdentifier(schema) + "." + qTable
}

// buildTruncateSQL returns a statement that empties the target table.
// SQLite has no TRUNCATE, so it falls back to DELETE FROM (same rows-gone
// effect, no identity/sequence reset — acceptable for an import's
// "start from empty" option).
func buildTruncateSQL(dialect driverport.QueryDialect, driverName, schema, table string) string {
	qualified := qualifyTableName(dialect, schema, table)
	if driverName == constant.DriverSQLite {
		return "DELETE FROM " + qualified
	}
	return "TRUNCATE TABLE " + qualified
}

// buildBatchInsertSQL builds a single multi-row INSERT for rowCount rows of
// columns, using marker for each bind parameter. Every value is still sent
// as a driver arg (never interpolated into the SQL text), so this is safe
// regardless of what the CSV contains.
func buildBatchInsertSQL(dialect driverport.QueryDialect, marker driverport.BindMarker, schema, table string, columns []string, rowCount int) string {
	qCols := make([]string, len(columns))
	for i, c := range columns {
		qCols[i] = dialect.QuoteIdentifier(c)
	}

	var sb strings.Builder
	sb.WriteString("INSERT INTO ")
	sb.WriteString(qualifyTableName(dialect, schema, table))
	sb.WriteString(" (")
	sb.WriteString(strings.Join(qCols, ", "))
	sb.WriteString(") VALUES ")

	n := 1
	for r := 0; r < rowCount; r++ {
		if r > 0 {
			sb.WriteString(", ")
		}
		sb.WriteString("(")
		for c := 0; c < len(columns); c++ {
			if c > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString(marker(n))
			n++
		}
		sb.WriteString(")")
	}
	return sb.String()
}

// countingReader wraps an io.Reader, tracking bytes read so the import
// loop can report progress as bytes-consumed/file-size (the file's row
// count isn't known upfront without a separate full pass).
type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

// importExecutor is satisfied by both *sql.Conn (autocommit, no
// SingleTransaction) and *sql.Tx (SingleTransaction).
type importExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// StartCSVImport opens opts.FilePath and starts streaming it into
// opts.Schema.opts.Table in a goroutine tracked as a Job, returning the Job
// id immediately. Unlike export, there's no save dialog step — the wizard
// already collected everything via previewCSVImport, so this never returns
// ("", nil) the way export's dialog-cancel does.
func (s *QueryService) StartCSVImport(opts CSVImportOptions) (string, error) {
	if err := validateImportOptions(opts); err != nil {
		return "", err
	}

	var parent context.Context = context.Background()
	var jobHandle *JobHandle
	if s.jobs != nil {
		parent, jobHandle = s.jobs.Start(context.Background(), JobSpec{
			Kind:         JobKindImport,
			Title:        fmt.Sprintf("%s → %s", filepath.Base(opts.FilePath), qualifiedImportTitle(opts.Schema, opts.Table)),
			ProfileName:  s.jobProfileName(),
			Database:     s.jobDatabase(),
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
		runErr := s.runImport(ctx, opts, jobHandle)
		if jobHandle != nil {
			jobHandle.Finish(runErr)
		}
	}()

	return jobID, nil
}

func qualifiedImportTitle(schema, table string) string {
	if strings.TrimSpace(schema) == "" {
		return table
	}
	return schema + "." + table
}

// runImport streams opts.FilePath into the target table. See the package
// doc comment above for why cancellation here is ctx-only.
func (s *QueryService) runImport(ctx context.Context, opts CSVImportOptions, jobHandle *JobHandle) (err error) {
	dialect := s.sessionDialect()
	if dialect == nil {
		return fmt.Errorf("unsupported or unknown driver")
	}
	db := s.getDB()
	if db == nil {
		return fmt.Errorf("no active connection")
	}

	conn, connErr := db.Conn(ctx)
	if connErr != nil {
		return fmt.Errorf("acquire connection: %w", connErr)
	}
	defer conn.Close()

	driverName := s.getDriver()
	marker := bindMarkerFor(driverName)

	var execer importExecutor = conn
	var tx *sql.Tx
	if opts.SingleTransaction {
		tx, err = conn.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin transaction: %w", err)
		}
		execer = tx
		defer func() {
			if err != nil {
				_ = tx.Rollback()
			}
		}()
	}

	if opts.TruncateFirst {
		if _, terr := execer.ExecContext(ctx, buildTruncateSQL(dialect, driverName, opts.Schema, opts.Table)); terr != nil {
			return fmt.Errorf("truncate table: %w", terr)
		}
	}

	f, ferr := os.Open(opts.FilePath)
	if ferr != nil {
		return fmt.Errorf("open file: %w", ferr)
	}
	defer f.Close()

	var totalBytes int64
	if info, statErr := f.Stat(); statErr == nil {
		totalBytes = info.Size()
	}

	delim, delimErr := parseDelimiter(opts.Delimiter)
	if delimErr != nil {
		return delimErr
	}

	counting := &countingReader{r: bufio.NewReader(f)}
	reader := csv.NewReader(counting)
	reader.Comma = delim
	reader.FieldsPerRecord = -1

	var sourceColumns []string
	if opts.HasHeader {
		header, herr := reader.Read()
		if herr != nil {
			return fmt.Errorf("read header: %w", herr)
		}
		sourceColumns = header
	}

	targetColumns, sourceIndexes, mapErr := resolveImportMapping(sourceColumns, opts.Mappings)
	if mapErr != nil {
		return mapErr
	}

	batchSize := opts.BatchSize
	if batchSize <= 0 {
		batchSize = defaultImportBatchSize
	}
	if maxRows := driverport.MaxBindParams / max(len(targetColumns), 1); batchSize > maxRows {
		batchSize = max(maxRows, 1)
	}

	skipMode := opts.OnError == "skip"
	var rowsImported, rowsSkipped int64
	var skipLog []string
	lineNum := 1
	if opts.HasHeader {
		lineNum = 2
	}
	batch := make([][]string, 0, batchSize)

	// Recorded on every exit path, not just success — SingleTransaction
	// rolls those rows back regardless, but without it (autocommit) each
	// flushed batch already landed, and a cancel/error partway through
	// should still tell the Activity panel how many rows actually made it.
	defer func() {
		if jobHandle == nil {
			return
		}
		jobHandle.SetMeta("rowsImported", strconv.FormatInt(rowsImported, 10))
		if rowsSkipped > 0 {
			jobHandle.SetMeta("rowsSkipped", strconv.FormatInt(rowsSkipped, 10))
			jobHandle.SetMeta("errorLog", strings.Join(skipLog, "\n"))
		}
	}()

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if skipMode {
			// One statement per row so a single bad row can be skipped
			// without discarding the rest of the batch — the trade-off is
			// losing the bulk multi-row INSERT's speed for this mode.
			for _, row := range batch {
				insertSQL := buildBatchInsertSQL(dialect, marker, opts.Schema, opts.Table, targetColumns, 1)
				if _, execErr := execer.ExecContext(ctx, insertSQL, rowValues(row, sourceIndexes, opts)...); execErr != nil {
					rowsSkipped++
					if len(skipLog) < 100 {
						skipLog = append(skipLog, fmt.Sprintf("line %d: %v", lineNum, execErr))
					}
				} else {
					rowsImported++
				}
				lineNum++
			}
		} else {
			insertSQL := buildBatchInsertSQL(dialect, marker, opts.Schema, opts.Table, targetColumns, len(batch))
			args := make([]any, 0, len(batch)*len(targetColumns))
			for _, row := range batch {
				args = append(args, rowValues(row, sourceIndexes, opts)...)
			}
			if _, execErr := execer.ExecContext(ctx, insertSQL, args...); execErr != nil {
				return fmt.Errorf("insert batch at line %d: %w", lineNum, execErr)
			}
			rowsImported += int64(len(batch))
			lineNum += len(batch)
		}
		batch = batch[:0]
		if jobHandle != nil {
			jobHandle.Report(counting.n, totalBytes, JobProgressUnitBytes, fmt.Sprintf("%d rows", rowsImported))
		}
		return nil
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		row, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("read row at line %d: %w", lineNum, readErr)
		}
		batch = append(batch, row)
		if len(batch) >= batchSize {
			if flushErr := flush(); flushErr != nil {
				return flushErr
			}
		}
	}
	if flushErr := flush(); flushErr != nil {
		return flushErr
	}

	if tx != nil {
		if commitErr := tx.Commit(); commitErr != nil {
			return fmt.Errorf("commit: %w", commitErr)
		}
	}
	return nil
}
