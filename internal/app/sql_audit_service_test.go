// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zentro/internal/models"
)

// newAuditServiceForTest wires an audit service against a project rooted in a
// tempdir so the audit file lives under <tempdir>/.zentro-tracking/runtime/.
func newAuditServiceForTest(t *testing.T) (*SQLAuditLogService, *models.Project) {
	t.Helper()
	project := &models.Project{ID: "proj-1", StoragePath: t.TempDir()}
	profile := &models.ConnectionProfile{Name: "dev", DBName: "appdb", Driver: "postgres"}
	svc := NewSQLAuditLogService(
		func() *models.ConnectionProfile { return profile },
		func() *models.Project { return project },
		func() string { return "dev" },
		func() string { return "postgres" },
		nil,
	)
	// Close the lazy file handle before tempdir cleanup tries to remove it
	// (Windows holds an exclusive lock on open files).
	t.Cleanup(func() { svc.Reset() })
	return svc, project
}

func TestSQLAudit_AppendAudit_WritesJSONLEntry(t *testing.T) {
	svc, project := newAuditServiceForTest(t)

	svc.AppendAudit(QueryExecutionAuditEvent{
		TabID:          "tab-1",
		StatementText:  "SELECT 1",
		StatementIndex: 0,
		StatementCount: 1,
		DurationMs:     12,
		RowCount:       1,
		IsSelect:       true,
	})

	auditPath := filepath.Join(project.StoragePath, ".zentro-tracking", "runtime", "sql_audit.log")
	data, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("audit file not created: %v", err)
	}
	if !strings.Contains(string(data), `"statement_text":"SELECT 1"`) {
		t.Errorf("audit file missing statement: %s", string(data))
	}
}

func TestSQLAudit_ListAudit_NewestFirst(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	for i, q := range []string{"SELECT 1", "SELECT 2", "SELECT 3"} {
		svc.AppendAudit(QueryExecutionAuditEvent{
			TabID:          "tab-1",
			StatementText:  q,
			StatementIndex: i,
			StatementCount: 1,
			IsSelect:       true,
		})
		time.Sleep(2 * time.Millisecond) // ensure distinct IDs
	}

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	if entries[0].StatementText != "SELECT 3" {
		t.Errorf("expected newest-first; got %q at index 0", entries[0].StatementText)
	}
	if entries[2].StatementText != "SELECT 1" {
		t.Errorf("expected oldest at end; got %q at index 2", entries[2].StatementText)
	}
}

func TestSQLAudit_ListAudit_Filters(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	svc.AppendAudit(QueryExecutionAuditEvent{TabID: "t1", StatementText: "SELECT * FROM users", IsSelect: true})
	svc.AppendAudit(QueryExecutionAuditEvent{TabID: "t2", StatementText: "UPDATE users SET x=1", Error: "permission denied"})
	svc.AppendAudit(QueryExecutionAuditEvent{TabID: "t3", StatementText: "SELECT * FROM orders", IsSelect: true})

	// Status: success
	got, _ := svc.ListAudit(SQLAuditFilter{Status: "success"})
	if len(got) != 2 {
		t.Errorf("status=success expected 2, got %d", len(got))
	}

	// Status: error
	got, _ = svc.ListAudit(SQLAuditFilter{Status: "error"})
	if len(got) != 1 {
		t.Errorf("status=error expected 1, got %d", len(got))
	}
	if got[0].Error != "permission denied" {
		t.Errorf("status=error: wrong entry returned: %+v", got[0])
	}

	// Search by statement
	got, _ = svc.ListAudit(SQLAuditFilter{Search: "orders"})
	if len(got) != 1 || !strings.Contains(got[0].StatementText, "orders") {
		t.Errorf("search=orders expected 1 entry with orders, got %d: %+v", len(got), got)
	}
}

func TestSQLAudit_AppendAudit_SkipsInternalQueries(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	svc.AppendAudit(QueryExecutionAuditEvent{
		TabID:         "t1",
		StatementText: `SELECT * FROM "app"."orders" /* zentro:schema-rev:0 */`,
		IsSelect:      true,
	})
	svc.AppendAudit(QueryExecutionAuditEvent{
		TabID:         "t2",
		StatementText: "SELECT * FROM orders",
		IsSelect:      true,
	})

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 user-facing audit entry, got %d", len(entries))
	}
	if entries[0].StatementText != "SELECT * FROM orders" {
		t.Fatalf("unexpected audit entry: %+v", entries[0])
	}
}

func TestSQLAudit_SetPinned_FlipsFlag(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	svc.AppendAudit(QueryExecutionAuditEvent{TabID: "t1", StatementText: "SELECT 1", IsSelect: true})
	entries, _ := svc.ListAudit(SQLAuditFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry to pin, got %d", len(entries))
	}
	id := entries[0].ID

	if err := svc.SetPinned(id, true); err != nil {
		t.Fatalf("SetPinned true: %v", err)
	}

	got, _ := svc.ListAudit(SQLAuditFilter{PinnedOnly: true})
	if len(got) != 1 || !got[0].Pinned {
		t.Errorf("PinnedOnly filter expected 1 pinned entry, got %+v", got)
	}

	// Unpin
	if err := svc.SetPinned(id, false); err != nil {
		t.Fatalf("SetPinned false: %v", err)
	}
	got, _ = svc.ListAudit(SQLAuditFilter{PinnedOnly: true})
	if len(got) != 0 {
		t.Errorf("expected 0 pinned after unpin, got %d", len(got))
	}
}

func TestSQLAudit_ClearAudit_RemovesEverything(t *testing.T) {
	svc, project := newAuditServiceForTest(t)

	for i := 0; i < 5; i++ {
		svc.AppendAudit(QueryExecutionAuditEvent{TabID: "t1", StatementText: "SELECT", IsSelect: true})
	}
	if err := svc.ClearAudit(); err != nil {
		t.Fatalf("ClearAudit: %v", err)
	}

	entries, _ := svc.ListAudit(SQLAuditFilter{})
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after clear, got %d", len(entries))
	}

	// File should still exist but be empty (truncated).
	auditPath := filepath.Join(project.StoragePath, ".zentro-tracking", "runtime", "sql_audit.log")
	if info, err := os.Stat(auditPath); err == nil && info.Size() != 0 {
		t.Errorf("expected empty audit file after clear, size=%d", info.Size())
	}
}

func TestSQLAudit_LegacyMigration_FromHistoryJSON(t *testing.T) {
	svc, project := newAuditServiceForTest(t)

	runtimeDir := filepath.Join(project.StoragePath, ".zentro-tracking", "runtime")
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := []legacyHistoryEntry{
		{ID: "a", Query: "SELECT old", Profile: "dev", DurationMs: 5, RowCount: 1, ExecutedAt: "2025-01-01T00:00:00Z"},
		{ID: "b", Query: "UPDATE old", Profile: "dev", DurationMs: 10, ExecutedAt: "2025-01-02T00:00:00Z"},
	}
	raw, _ := json.Marshal(legacy)
	if err := os.WriteFile(filepath.Join(runtimeDir, "history.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatalf("ListAudit: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 migrated entries, got %d", len(entries))
	}
	// Legacy renamed with .bak suffix after migration.
	if _, err := os.Stat(filepath.Join(runtimeDir, "history.json")); !os.IsNotExist(err) {
		t.Errorf("expected legacy history.json removed (renamed); err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(runtimeDir, "history.json.bak")); err != nil {
		t.Errorf("expected history.json.bak backup, err=%v", err)
	}
}
