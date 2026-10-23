// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/utils"
)

func TestFilterExportColumnIndexes_Subset(t *testing.T) {
	columns := []string{"id", "name", "status"}
	filtered, indexes, err := filterExportColumnIndexes(columns, []string{"status", "id"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(filtered) != 2 || filtered[0] != "status" || filtered[1] != "id" {
		t.Fatalf("unexpected filtered columns: %#v", filtered)
	}
	row := []string{"1", "Alice", "active"}
	if got := selectColumns(row, indexes); got[0] != "active" || got[1] != "1" {
		t.Fatalf("unexpected selected row: %#v", got)
	}
}

func TestFilterExportColumnIndexes_EmptySelectionKeepsEverything(t *testing.T) {
	columns := []string{"id", "name"}
	filtered, indexes, err := filterExportColumnIndexes(columns, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(filtered) != 2 || len(indexes) != 2 {
		t.Fatalf("expected all columns kept, got %#v / %#v", filtered, indexes)
	}
}

func TestFilterExportColumnIndexes_UnknownColumnErrorsBeforeAnyRowIsWritten(t *testing.T) {
	_, _, err := filterExportColumnIndexes([]string{"id", "name"}, []string{"missing"})
	if err == nil {
		t.Fatal("expected an error for an unknown column")
	}
}

func TestRunExportInView_WritesHeaderAndEveryRow(t *testing.T) {
	svc := &QueryService{}
	path := filepath.Join(t.TempDir(), "out.csv")

	rows := [][]string{{"1", "Alice"}, {"2", "Bob"}}
	if err := svc.runExportInView(context.Background(), "csv", "", []string{"id", "name"}, rows, path, nil); err != nil {
		t.Fatalf("runExportInView: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	body := strings.TrimPrefix(string(content), "\xEF\xBB\xBF")
	lines := strings.Split(strings.TrimRight(body, "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected header + 2 rows, got %#v", lines)
	}
}

func TestRunExportInView_StopsAtAnAlreadyCancelledContext(t *testing.T) {
	svc := &QueryService{}
	path := filepath.Join(t.TempDir(), "out.csv")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	rows := [][]string{{"1"}, {"2"}, {"3"}}
	err := svc.runExportInView(ctx, "csv", "", []string{"id"}, rows, path, nil)
	if err == nil {
		t.Fatal("expected a cancellation error")
	}
}

func TestRunExportInView_ReportsDeterminateProgress(t *testing.T) {
	svc := &QueryService{}
	path := filepath.Join(t.TempDir(), "out.csv")

	jobs, _ := newTestJobService()
	_, handle := jobs.Start(context.Background(), JobSpec{Kind: JobKindExport, Title: "t"})

	rows := [][]string{{"1"}, {"2"}, {"3"}}
	if err := svc.runExportInView(context.Background(), "csv", "", []string{"id"}, rows, path, handle); err != nil {
		t.Fatalf("runExportInView: %v", err)
	}

	job := jobs.List()[0]
	if job.Progress.Done != 3 || job.Progress.Total != 3 {
		t.Fatalf("expected final progress 3/3, got %+v", job.Progress)
	}
}

func TestRunExportAllRows_StreamsEveryRowAndRespectsSelectedColumns(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	if _, err := db.Exec(`CREATE TABLE widgets (id INTEGER, name TEXT, note TEXT);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for i := 1; i <= 5; i++ {
		if _, err := db.Exec(`INSERT INTO widgets (id, name, note) VALUES (?, ?, ?);`, i, "w", "secret"); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}

	svc := NewQueryService(
		context.Background(), utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{QueryTimeout: 5} },
		func() *sql.DB { return db },
		func() sqlExecutor { return db },
		func() string { return constant.DriverSQLite },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{},
	)
	svc.activeQueriesMu.Lock()
	svc.activeQueries["tab-1"] = "SELECT id, name, note FROM widgets ORDER BY id"
	svc.activeQueriesMu.Unlock()

	path := filepath.Join(t.TempDir(), "out.json")
	err := svc.runExportAllRows(context.Background(), "json", "", []string{"id", "name"}, "tab-1", path, 0, nil)
	if err != nil {
		t.Fatalf("runExportAllRows: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(content, &decoded); err != nil {
		t.Fatalf("invalid JSON output: %v\n%s", err, content)
	}
	if len(decoded) != 5 {
		t.Fatalf("expected 5 rows, got %d", len(decoded))
	}
	if _, hasNote := decoded[0]["note"]; hasNote {
		t.Error("expected the unselected 'note' column to be excluded from the export")
	}
	if decoded[0]["id"] != "1" {
		t.Fatalf("unexpected first row: %#v", decoded[0])
	}
}

func TestRunExportAllRows_UsesKnownTotalForDeterminateProgress(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	if _, err := db.Exec(`CREATE TABLE widgets (id INTEGER);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for i := 1; i <= 5; i++ {
		if _, err := db.Exec(`INSERT INTO widgets (id) VALUES (?);`, i); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}

	svc := NewQueryService(
		context.Background(), utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{QueryTimeout: 5} },
		func() *sql.DB { return db },
		func() sqlExecutor { return db },
		func() string { return constant.DriverSQLite },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{},
	)
	svc.activeQueriesMu.Lock()
	svc.activeQueries["tab-1"] = "SELECT id FROM widgets ORDER BY id"
	svc.activeQueriesMu.Unlock()

	jobs, _ := newTestJobService()
	_, handle := jobs.Start(context.Background(), JobSpec{Kind: JobKindExport, Title: "t"})

	path := filepath.Join(t.TempDir(), "out.csv")
	// knownTotal (5) mirrors the frontend's own already-cached COUNT(*) —
	// the point of this test is that it, not a second count query the
	// export would have to run itself, drives the final progress.
	if err := svc.runExportAllRows(context.Background(), "csv", "", nil, "tab-1", path, 5, handle); err != nil {
		t.Fatalf("runExportAllRows: %v", err)
	}

	job := jobs.List()[0]
	if job.Progress.Done != 5 || job.Progress.Total != 5 {
		t.Fatalf("expected final progress 5/5 from knownTotal, got %+v", job.Progress)
	}
	// Regression: a non-empty Detail here ("N rows") used to shadow the
	// Activity panel's own richer "done / total rows" caption — Detail
	// must stay empty so the frontend computes it from Done/Total instead.
	if job.Progress.Detail != "" {
		t.Fatalf("expected empty Detail so the frontend computes its own caption, got %q", job.Progress.Detail)
	}
}

func TestRunExportAllRows_ZeroKnownTotalFallsBackToCountingItself(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	if _, err := db.Exec(`CREATE TABLE widgets (id INTEGER);`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	for i := 1; i <= 3; i++ {
		if _, err := db.Exec(`INSERT INTO widgets (id) VALUES (?);`, i); err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}

	svc := NewQueryService(
		context.Background(), utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{QueryTimeout: 5} },
		func() *sql.DB { return db },
		func() sqlExecutor { return db },
		func() string { return constant.DriverSQLite },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{},
	)
	svc.activeQueriesMu.Lock()
	svc.activeQueries["tab-1"] = "SELECT id FROM widgets ORDER BY id"
	svc.activeQueriesMu.Unlock()

	jobs, _ := newTestJobService()
	_, handle := jobs.Start(context.Background(), JobSpec{Kind: JobKindExport, Title: "t"})

	path := filepath.Join(t.TempDir(), "out.csv")
	// knownTotal=0 means the frontend didn't have one cached yet — the
	// export must run its own COUNT(*) rather than leaving the whole run
	// indeterminate (see bestEffortRowCount).
	if err := svc.runExportAllRows(context.Background(), "csv", "", nil, "tab-1", path, 0, handle); err != nil {
		t.Fatalf("runExportAllRows: %v", err)
	}

	job := jobs.List()[0]
	if job.Progress.Done != 3 || job.Progress.Total != 3 {
		t.Fatalf("expected final progress 3/3 from the fallback count, got %+v", job.Progress)
	}
}

func TestRunExportAllRows_NoActiveQueryErrors(t *testing.T) {
	svc := NewQueryService(
		context.Background(), utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{} },
		func() *sql.DB { return nil },
		func() sqlExecutor { return nil },
		func() string { return constant.DriverSQLite },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{},
	)
	err := svc.runExportAllRows(context.Background(), "csv", "", nil, "no-such-tab", filepath.Join(t.TempDir(), "x.csv"), 0, nil)
	if err == nil {
		t.Fatal("expected an error when there's no active query for the tab")
	}
}
