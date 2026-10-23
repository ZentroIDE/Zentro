// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/utils"
)

func writeTempCSV(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "data.csv")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write temp csv: %v", err)
	}
	return path
}

func TestParseDelimiter(t *testing.T) {
	cases := map[string]rune{"": ',', ",": ',', ";": ';', "\t": '\t', "|": '|', "#": '#'}
	for in, want := range cases {
		got, err := parseDelimiter(in)
		if err != nil {
			t.Fatalf("parseDelimiter(%q): %v", in, err)
		}
		if got != want {
			t.Errorf("parseDelimiter(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := parseDelimiter("ab"); err == nil {
		t.Error("expected an error for a multi-character delimiter")
	}
}

func TestPreviewCSVImport_WithHeader(t *testing.T) {
	path := writeTempCSV(t, "id,name,active\n1,Alice,true\n2,Bob,false\n3,Carol,true\n")

	preview, err := previewCSVImport(path, ",", true)
	if err != nil {
		t.Fatalf("previewCSVImport: %v", err)
	}
	if len(preview.Columns) != 3 || preview.Columns[0] != "id" {
		t.Fatalf("unexpected columns: %#v", preview.Columns)
	}
	if len(preview.SampleRows) != 3 {
		t.Fatalf("expected 3 sample rows, got %d", len(preview.SampleRows))
	}
	if preview.InferredTypes[0] != "integer" {
		t.Errorf("expected id to be inferred integer, got %q", preview.InferredTypes[0])
	}
	if preview.InferredTypes[2] != "boolean" {
		t.Errorf("expected active to be inferred boolean, got %q", preview.InferredTypes[2])
	}
	if preview.InferredTypes[1] != "text" {
		t.Errorf("expected name to be inferred text, got %q", preview.InferredTypes[1])
	}
	if preview.FileSizeBytes <= 0 {
		t.Error("expected a positive file size")
	}
}

func TestPreviewCSVImport_NoHeaderUsesSyntheticColumnNames(t *testing.T) {
	path := writeTempCSV(t, "1,Alice\n2,Bob\n")

	preview, err := previewCSVImport(path, ",", false)
	if err != nil {
		t.Fatalf("previewCSVImport: %v", err)
	}
	if len(preview.Columns) != 2 || preview.Columns[0] != "column_1" || preview.Columns[1] != "column_2" {
		t.Fatalf("unexpected synthetic columns: %#v", preview.Columns)
	}
	if len(preview.SampleRows) != 2 {
		t.Fatalf("expected 2 sample rows (no header consumed), got %d", len(preview.SampleRows))
	}
}

func TestPreviewCSVImport_MissingFile(t *testing.T) {
	if _, err := previewCSVImport(filepath.Join(t.TempDir(), "missing.csv"), ",", true); err == nil {
		t.Fatal("expected an error for a missing file")
	}
}

func TestResolveImportMapping_ByHeaderName(t *testing.T) {
	cols, idxs, err := resolveImportMapping(
		[]string{"id", "name", "note"},
		[]ImportColumnMapping{
			{SourceColumn: "note", TargetColumn: ""}, // skipped
			{SourceColumn: "id", TargetColumn: "id"},
			{SourceColumn: "name", TargetColumn: "full_name"},
		},
	)
	if err != nil {
		t.Fatalf("resolveImportMapping: %v", err)
	}
	if len(cols) != 2 || cols[0] != "id" || cols[1] != "full_name" {
		t.Fatalf("unexpected target columns: %#v", cols)
	}
	if len(idxs) != 2 || idxs[0] != 0 || idxs[1] != 1 {
		t.Fatalf("unexpected source indexes: %#v", idxs)
	}
}

func TestResolveImportMapping_SyntheticColumnNames(t *testing.T) {
	cols, idxs, err := resolveImportMapping(
		nil, // no header
		[]ImportColumnMapping{{SourceColumn: "column_2", TargetColumn: "name"}},
	)
	if err != nil {
		t.Fatalf("resolveImportMapping: %v", err)
	}
	if cols[0] != "name" || idxs[0] != 1 {
		t.Fatalf("unexpected mapping: cols=%#v idxs=%#v", cols, idxs)
	}
}

func TestResolveImportMapping_UnknownColumnErrors(t *testing.T) {
	_, _, err := resolveImportMapping(
		[]string{"id"},
		[]ImportColumnMapping{{SourceColumn: "missing", TargetColumn: "id"}},
	)
	if err == nil {
		t.Fatal("expected an error for an unresolvable source column")
	}
}

func TestResolveImportMapping_NoColumnsMappedErrors(t *testing.T) {
	_, _, err := resolveImportMapping([]string{"id"}, []ImportColumnMapping{{SourceColumn: "id", TargetColumn: ""}})
	if err == nil {
		t.Fatal("expected an error when nothing is mapped")
	}
}

func TestRowValues_NullTokenAndTrim(t *testing.T) {
	opts := CSVImportOptions{NullToken: "NULL", TrimWhitespace: true}
	values := rowValues([]string{" 1 ", "NULL", " Alice"}, []int{0, 1, 2}, opts)
	if values[0] != "1" {
		t.Errorf("expected trimmed value, got %#v", values[0])
	}
	if values[1] != nil {
		t.Errorf("expected NULL token to become nil, got %#v", values[1])
	}
	if values[2] != "Alice" {
		t.Errorf("expected trimmed value, got %#v", values[2])
	}
}

func TestBindMarkerFor(t *testing.T) {
	if got := bindMarkerFor(constant.DriverPostgres)(2); got != "$2" {
		t.Errorf("postgres marker = %q", got)
	}
	if got := bindMarkerFor(constant.DriverSQLServer)(3); got != "@p3" {
		t.Errorf("mssql marker = %q", got)
	}
	if got := bindMarkerFor(constant.DriverMySQL)(1); got != "?" {
		t.Errorf("mysql marker = %q", got)
	}
	if got := bindMarkerFor(constant.DriverSQLite)(1); got != "?" {
		t.Errorf("sqlite marker = %q", got)
	}
}

func TestValidateImportOptions(t *testing.T) {
	base := CSVImportOptions{
		FilePath: "x.csv",
		Table:    "t",
		Mappings: []ImportColumnMapping{{SourceColumn: "a", TargetColumn: "a"}},
	}
	if err := validateImportOptions(base); err != nil {
		t.Fatalf("expected valid options to pass, got %v", err)
	}

	noFile := base
	noFile.FilePath = ""
	if err := validateImportOptions(noFile); err == nil {
		t.Error("expected an error without a file path")
	}

	noTable := base
	noTable.Table = ""
	if err := validateImportOptions(noTable); err == nil {
		t.Error("expected an error without a target table")
	}

	noMapping := base
	noMapping.Mappings = nil
	if err := validateImportOptions(noMapping); err == nil {
		t.Error("expected an error without any mapped column")
	}

	badOnError := base
	badOnError.OnError = "retry"
	if err := validateImportOptions(badOnError); err == nil {
		t.Error("expected an error for an invalid onError value")
	}
}

func newImportTestService(t *testing.T, db *sql.DB) *QueryService {
	t.Helper()
	return NewQueryService(
		context.Background(), utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{} },
		func() *sql.DB { return db },
		func() sqlExecutor { return db },
		func() string { return constant.DriverSQLite },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{},
	)
}

func TestRunImport_AutocommitInsertsEveryRow(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE people (id INTEGER, name TEXT, note TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	path := writeTempCSV(t, "id,name,note\n1,Alice,\n2,Bob,hi\n3,Carol,NULL\n")
	svc := newImportTestService(t, db)

	opts := CSVImportOptions{
		FilePath:  path,
		HasHeader: true,
		Table:     "people",
		Mappings: []ImportColumnMapping{
			{SourceColumn: "id", TargetColumn: "id"},
			{SourceColumn: "name", TargetColumn: "name"},
			{SourceColumn: "note", TargetColumn: "note"},
		},
		NullToken: "NULL",
		BatchSize: 2, // force at least 2 flush()es across 3 rows
	}

	jobs, _ := newTestJobService()
	_, handle := jobs.Start(context.Background(), JobSpec{Kind: JobKindImport, Title: "t"})

	if err := svc.runImport(context.Background(), opts, handle); err != nil {
		t.Fatalf("runImport: %v", err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM people`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 rows imported, got %d", count)
	}

	var noteForCarol sql.NullString
	if err := db.QueryRow(`SELECT note FROM people WHERE id = 3`).Scan(&noteForCarol); err != nil {
		t.Fatalf("read carol's note: %v", err)
	}
	if noteForCarol.Valid {
		t.Errorf("expected NULL token to import as NULL, got %q", noteForCarol.String)
	}

	job := jobs.List()[0]
	if job.Meta["rowsImported"] != "3" {
		t.Errorf("expected job meta rowsImported=3, got %+v", job.Meta)
	}
}

func TestRunImport_TruncateFirst(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE people (id INTEGER, name TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO people (id, name) VALUES (99, 'stale');`); err != nil {
		t.Fatalf("seed stale row: %v", err)
	}

	path := writeTempCSV(t, "id,name\n1,Alice\n")
	svc := newImportTestService(t, db)
	opts := CSVImportOptions{
		FilePath:      path,
		HasHeader:     true,
		Table:         "people",
		Mappings:      []ImportColumnMapping{{SourceColumn: "id", TargetColumn: "id"}, {SourceColumn: "name", TargetColumn: "name"}},
		TruncateFirst: true,
	}

	if err := svc.runImport(context.Background(), opts, nil); err != nil {
		t.Fatalf("runImport: %v", err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM people`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected the stale row to be truncated away, got %d rows", count)
	}
}

func TestRunImport_SingleTransactionRollsBackOnCancel(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE people (id INTEGER, name TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	// 10 rows, batch size 1 so the loop's ctx.Err() check definitely fires
	// before every row is flushed once the context is cancelled.
	rows := make([]string, 0, 10)
	for i := 1; i <= 10; i++ {
		rows = append(rows, fmt.Sprintf("%d,row", i))
	}
	path := writeTempCSV(t, "id,name\n"+strings.Join(rows, "\n")+"\n")
	svc := newImportTestService(t, db)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled — the very first loop iteration must stop

	opts := CSVImportOptions{
		FilePath:          path,
		HasHeader:         true,
		Table:             "people",
		Mappings:          []ImportColumnMapping{{SourceColumn: "id", TargetColumn: "id"}, {SourceColumn: "name", TargetColumn: "name"}},
		SingleTransaction: true,
		BatchSize:         1,
	}

	err := svc.runImport(ctx, opts, nil)
	if err == nil {
		t.Fatal("expected a cancellation error")
	}

	var count int
	if qErr := db.QueryRow(`SELECT COUNT(*) FROM people`).Scan(&count); qErr != nil {
		t.Fatalf("count rows: %v", qErr)
	}
	if count != 0 {
		t.Fatalf("expected the transaction to roll back every row, got %d", count)
	}
}

func TestRunImport_SkipModeContinuesPastBadRows(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	// A duplicate primary key on row 2 fails under SQLite's PK constraint;
	// skip mode must still import rows 1 and 3.
	if _, err := db.Exec(`INSERT INTO people (id, name) VALUES (2, 'existing');`); err != nil {
		t.Fatalf("seed existing row: %v", err)
	}

	path := writeTempCSV(t, "id,name\n1,Alice\n2,Duplicate\n3,Carol\n")
	svc := newImportTestService(t, db)
	opts := CSVImportOptions{
		FilePath:  path,
		HasHeader: true,
		Table:     "people",
		Mappings:  []ImportColumnMapping{{SourceColumn: "id", TargetColumn: "id"}, {SourceColumn: "name", TargetColumn: "name"}},
		OnError:   "skip",
	}

	jobs, _ := newTestJobService()
	_, handle := jobs.Start(context.Background(), JobSpec{Kind: JobKindImport, Title: "t"})

	if err := svc.runImport(context.Background(), opts, handle); err != nil {
		t.Fatalf("runImport: %v", err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM people`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 3 { // 1 pre-existing + 2 newly imported (1 and 3)
		t.Fatalf("expected 3 rows total, got %d", count)
	}

	job := jobs.List()[0]
	if job.Meta["rowsSkipped"] != "1" {
		t.Errorf("expected rowsSkipped=1, got %+v", job.Meta)
	}
	if job.Meta["rowsImported"] != "2" {
		t.Errorf("expected rowsImported=2, got %+v", job.Meta)
	}
}

func TestRunImport_AbortModeStopsAtFirstBadRow(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO people (id, name) VALUES (2, 'existing');`); err != nil {
		t.Fatalf("seed existing row: %v", err)
	}

	path := writeTempCSV(t, "id,name\n1,Alice\n2,Duplicate\n3,Carol\n")
	svc := newImportTestService(t, db)
	opts := CSVImportOptions{
		FilePath:  path,
		HasHeader: true,
		Table:     "people",
		Mappings:  []ImportColumnMapping{{SourceColumn: "id", TargetColumn: "id"}, {SourceColumn: "name", TargetColumn: "name"}},
		OnError:   "abort",
		BatchSize: 1, // one row per statement so row 1 is already committed (autocommit) before row 2 fails
	}

	if err := svc.runImport(context.Background(), opts, nil); err == nil {
		t.Fatal("expected abort mode to return an error on the first bad row")
	}
}
