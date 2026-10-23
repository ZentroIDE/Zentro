// SPDX-License-Identifier: GPL-3.0-only

package app

// Streaming writers for result-set export. Pattern: Strategy — one
// rowWriter implementation per format, selected by newRowWriter, so
// export_service.go's streaming loop (export_service.go) never branches on
// format itself and never has to buffer the whole result set in memory the
// way the old exportCSV/exportJSON/exportSQLInsert functions did.

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// rowWriter streams one export format to an open file, one row at a time.
type rowWriter interface {
	// WriteHeader is called exactly once, before any WriteRow call.
	WriteHeader(columns []string) error
	WriteRow(row []string) error
	// Close flushes and closes the underlying file. Called exactly once,
	// however the export ends — a writer that needs a closing fragment
	// (jsonRowWriter's trailing "]") writes it here.
	Close() error
}

// newRowWriter opens path and returns the writer for format ("csv",
// "json", or anything else, which falls back to csv). tableName is only
// used by the sql format.
func newRowWriter(format, path, tableName string) (rowWriter, error) {
	switch format {
	case "json":
		return newJSONRowWriter(path)
	case "sql":
		return newSQLInsertRowWriter(path, tableName)
	default:
		return newCSVRowWriter(path)
	}
}

type csvRowWriter struct {
	f *os.File
	w *csv.Writer
}

func newCSVRowWriter(path string) (*csvRowWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	// UTF-8 BOM so Excel opens the file with the correct encoding.
	if _, err := f.WriteString("\xEF\xBB\xBF"); err != nil {
		_ = f.Close()
		return nil, err
	}
	return &csvRowWriter{f: f, w: csv.NewWriter(f)}, nil
}

func (w *csvRowWriter) WriteHeader(columns []string) error {
	if len(columns) == 0 {
		return nil
	}
	return w.w.Write(columns)
}

func (w *csvRowWriter) WriteRow(row []string) error {
	return w.w.Write(row)
}

func (w *csvRowWriter) Close() error {
	w.w.Flush()
	if err := w.w.Error(); err != nil {
		_ = w.f.Close()
		return err
	}
	return w.f.Close()
}

// jsonRowWriter streams a JSON array of row objects — one json.Marshal
// call per row plus a literal "," separator — instead of building the
// whole array (and its intermediate []map[string]any) in memory first the
// way the old exportJSON function did.
type jsonRowWriter struct {
	f       *os.File
	columns []string
	wrote   bool
}

func newJSONRowWriter(path string) (*jsonRowWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	if _, err := f.WriteString("[\n"); err != nil {
		_ = f.Close()
		return nil, err
	}
	return &jsonRowWriter{f: f}, nil
}

func (w *jsonRowWriter) WriteHeader(columns []string) error {
	w.columns = columns
	return nil
}

func (w *jsonRowWriter) WriteRow(row []string) error {
	obj := make(map[string]any, len(w.columns))
	for i, col := range w.columns {
		if i < len(row) {
			obj[col] = parseCellValue(row[i])
		}
	}
	data, err := json.Marshal(obj)
	if err != nil {
		return fmt.Errorf("marshal row: %w", err)
	}
	prefix := "  "
	if w.wrote {
		prefix = ",\n  "
	}
	if _, err := w.f.WriteString(prefix); err != nil {
		return err
	}
	if _, err := w.f.Write(data); err != nil {
		return err
	}
	w.wrote = true
	return nil
}

func (w *jsonRowWriter) Close() error {
	if _, err := w.f.WriteString("\n]\n"); err != nil {
		_ = w.f.Close()
		return err
	}
	return w.f.Close()
}

// sqlInsertRowWriter streams one INSERT statement per row. The old
// exportSQLInsert function wrote a "-- Rows: N" header before any row was
// known, which only worked because it had the whole slice upfront;
// streaming can't know N until the last row, so it's written as a footer
// here instead.
type sqlInsertRowWriter struct {
	f         *os.File
	tableName string
	columns   []string
	rowCount  int
}

func newSQLInsertRowWriter(path, tableName string) (*sqlInsertRowWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	if _, err := fmt.Fprintf(f, "-- Generated SQL INSERT statements\n-- Table: %s\n\n", tableName); err != nil {
		_ = f.Close()
		return nil, err
	}
	return &sqlInsertRowWriter{f: f, tableName: tableName}, nil
}

func (w *sqlInsertRowWriter) WriteHeader(columns []string) error {
	w.columns = columns
	return nil
}

func (w *sqlInsertRowWriter) WriteRow(row []string) error {
	if len(w.columns) == 0 {
		return nil
	}
	values := make([]string, len(row))
	for i, val := range row {
		values[i] = formatSQLValue(val)
	}
	_, err := fmt.Fprintf(w.f, "INSERT INTO %s (%s) VALUES (%s);\n",
		w.tableName, strings.Join(w.columns, ", "), strings.Join(values, ", "))
	if err == nil {
		w.rowCount++
	}
	return err
}

func (w *sqlInsertRowWriter) Close() error {
	if _, err := fmt.Fprintf(w.f, "\n-- Rows: %d\n", w.rowCount); err != nil {
		_ = w.f.Close()
		return err
	}
	return w.f.Close()
}

// parseCellValue attempts to parse a cell value to the appropriate JSON
// type (object/array), falling back to a plain string. Unchanged from the
// original buffered exportJSON function.
func parseCellValue(val string) any {
	if val == "" || val == "NULL" {
		return nil
	}

	trimmed := strings.TrimSpace(val)
	if (strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}")) ||
		(strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]")) {
		var jsonVal any
		if err := json.Unmarshal([]byte(trimmed), &jsonVal); err == nil {
			return jsonVal
		}
	}

	return val
}

// formatSQLValue formats a value for a SQL INSERT statement. Unchanged
// from the original buffered exportSQLInsert function.
func formatSQLValue(val string) string {
	if val == "" || val == "NULL" {
		return "NULL"
	}
	if isNumeric(val) {
		return val
	}
	escaped := strings.ReplaceAll(val, "'", "''")
	return fmt.Sprintf("'%s'", escaped)
}

// isNumeric reports whether s parses as a number. Fixed from the original
// buffered exportSQLInsert's version, which called fmt.Sscanf(s, "%f")
// with no destination argument for %f to scan into — Sscanf always failed
// to parse anything, so isNumeric always returned false and every numeric
// cell was quoted as a SQL string literal instead of a bare number.
func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}
