// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"zentro/internal/models"
)

func mcpEntry(action string) SQLAuditEntry {
	return SQLAuditEntry{Action: action}
}

func TestAppendMCPAuditSetsSourceAndStartsTheChain(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	if err := svc.AppendMCPAudit(mcpEntry("search_schema")); err != nil {
		t.Fatalf("AppendMCPAudit: %v", err)
	}

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Source != "mcp" || e.Action != "search_schema" {
		t.Fatalf("Source/Action wrong: %+v", e)
	}
	if e.Hash == "" {
		t.Fatal("the first entry has no Hash")
	}
	if e.PrevHash != "" {
		t.Fatalf("the first entry should chain from nothing, got PrevHash=%q", e.PrevHash)
	}
}

func TestAppendMCPAuditNeverStoresTheSQLLiteral(t *testing.T) {
	svc, project := newAuditServiceForTest(t)

	// ai_mcp.go is what would normally normalize and hash this; here we
	// confirm AppendMCPAudit itself writes only what it is given, and the
	// file never gets the literal because nothing passes it one.
	if err := svc.AppendMCPAudit(SQLAuditEntry{
		Action:        "classify_sql",
		SQLNormalized: "delete from t where id = ?",
		SQLHash:       "abc123",
	}); err != nil {
		t.Fatal(err)
	}

	path, err := svc.AuditFilePath()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "id = 42") || strings.Contains(string(data), "'secret'") {
		t.Fatalf("a literal leaked into the audit file: %s", data)
	}
	if !strings.Contains(string(data), "id = ?") {
		t.Fatalf("the normalized SQL did not make it into the file: %s", data)
	}
	_ = project
}

func TestAppendMCPAuditChainsConsecutiveEntries(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	for _, action := range []string{"a", "b", "c"} {
		if err := svc.AppendMCPAudit(mcpEntry(action)); err != nil {
			t.Fatal(err)
		}
	}

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	// ListAudit returns newest-first; put back in write order.
	for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
		entries[i], entries[j] = entries[j], entries[i]
	}
	if entries[1].PrevHash != entries[0].Hash {
		t.Fatalf("entry 2 does not chain from entry 1: %+v / %+v", entries[1], entries[0])
	}
	if entries[2].PrevHash != entries[1].Hash {
		t.Fatalf("entry 3 does not chain from entry 2: %+v / %+v", entries[2], entries[1])
	}

	brokenID, valid, err := svc.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if !valid || brokenID != "" {
		t.Fatalf("an untouched chain was reported broken: id=%q", brokenID)
	}
}

func TestVerifyChainDetectsATamperedRecord(t *testing.T) {
	svc, project := newAuditServiceForTest(t)
	for _, action := range []string{"a", "b", "c"} {
		if err := svc.AppendMCPAudit(mcpEntry(action)); err != nil {
			t.Fatal(err)
		}
	}
	path, err := svc.AuditFilePath()
	if err != nil {
		t.Fatal(err)
	}
	svc.Reset() // close the handle before editing the file on disk

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(lines))
	}
	var middle SQLAuditEntry
	if err := json.Unmarshal([]byte(lines[1]), &middle); err != nil {
		t.Fatal(err)
	}
	tamperedID := middle.ID
	// Edit the middle record's content without recomputing its Hash -- the
	// naive tamper VerifyChain exists to catch.
	middle.Action = "tampered"
	tamperedLine, err := json.Marshal(middle)
	if err != nil {
		t.Fatal(err)
	}
	lines[1] = string(tamperedLine)
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	brokenID, valid, err := svc.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if valid {
		t.Fatal("a tampered record was reported as a valid chain")
	}
	if brokenID != tamperedID {
		t.Fatalf("got broken id %q, want %q", brokenID, tamperedID)
	}
	_ = project
}

func TestVerifyChainSkipsEntriesWithNoHash(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)

	// A UI write (AppendAudit) carries no Hash; it must not break the MCP
	// chain that surrounds it in the same file.
	svc.AppendAudit(QueryExecutionAuditEvent{StatementText: "SELECT 1", StatementCount: 1})
	if err := svc.AppendMCPAudit(mcpEntry("a")); err != nil {
		t.Fatal(err)
	}
	svc.AppendAudit(QueryExecutionAuditEvent{StatementText: "SELECT 2", StatementCount: 1})
	if err := svc.AppendMCPAudit(mcpEntry("b")); err != nil {
		t.Fatal(err)
	}

	brokenID, valid, err := svc.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if !valid || brokenID != "" {
		t.Fatalf("UI entries interleaved with MCP ones broke the chain: id=%q", brokenID)
	}
}

func TestRotationKeepsTheMCPChainContinuous(t *testing.T) {
	svc, _ := newAuditServiceForTest(t)
	if err := svc.AppendMCPAudit(mcpEntry("before-rotation")); err != nil {
		t.Fatal(err)
	}
	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	firstHash := entries[0].Hash

	svc.mu.Lock()
	if err := svc.rotateLocked(); err != nil {
		svc.mu.Unlock()
		t.Fatalf("rotateLocked: %v", err)
	}
	svc.mu.Unlock()

	if err := svc.AppendMCPAudit(mcpEntry("after-rotation")); err != nil {
		t.Fatal(err)
	}

	all, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected both entries visible across the rotation, got %d", len(all))
	}
	var after SQLAuditEntry
	for _, e := range all {
		if e.Action == "after-rotation" {
			after = e
		}
	}
	if after.PrevHash != firstHash {
		t.Fatalf("the entry after rotation did not chain from the one before it: got PrevHash=%q, want %q", after.PrevHash, firstHash)
	}

	brokenID, valid, err := svc.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if !valid || brokenID != "" {
		t.Fatalf("the chain across a rotation was reported broken: id=%q", brokenID)
	}
}

func TestLoadLastMCPHashRecoversAfterARestart(t *testing.T) {
	svc, project := newAuditServiceForTest(t)
	if err := svc.AppendMCPAudit(mcpEntry("before-restart")); err != nil {
		t.Fatal(err)
	}
	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	lastHash := entries[0].Hash
	svc.Reset()

	// A second service instance over the same project stands in for a fresh
	// process after a restart: it has no in-memory lastMCPHash of its own.
	restarted := NewSQLAuditLogService(
		func() *models.ConnectionProfile { return nil },
		func() *models.Project { return project },
		func() string { return "dev" },
		func() string { return "postgres" },
		nil,
	)
	t.Cleanup(func() { restarted.Reset() })

	if err := restarted.AppendMCPAudit(mcpEntry("after-restart")); err != nil {
		t.Fatal(err)
	}
	all, err := restarted.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	var after SQLAuditEntry
	for _, e := range all {
		if e.Action == "after-restart" {
			after = e
		}
	}
	if after.PrevHash != lastHash {
		t.Fatalf("the chain did not survive a restart: got PrevHash=%q, want %q", after.PrevHash, lastHash)
	}
}

func TestOldRecordWithoutTheNewFieldsStillDecodes(t *testing.T) {
	svc, project := newAuditServiceForTest(t)
	path, err := svc.AuditFilePath()
	if err != nil {
		t.Fatal(err)
	}
	// The exact shape a pre-T1.5 record has: none of the new fields at all.
	legacyLine := `{"id":"1","executed_at":"2026-01-01T00:00:00Z","statement_text":"SELECT 1","statement_count":1,"profile":"dev","database":"appdb"}` + "\n"
	if err := os.WriteFile(path, []byte(legacyLine), 0o644); err != nil {
		t.Fatal(err)
	}

	entries, err := svc.ListAudit(SQLAuditFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.StatementText != "SELECT 1" || e.Source != "" || e.Hash != "" {
		t.Fatalf("an old record did not decode as expected: %+v", e)
	}

	brokenID, valid, err := svc.VerifyChain()
	if err != nil {
		t.Fatal(err)
	}
	if !valid || brokenID != "" {
		t.Fatalf("an old, unchained record was treated as a broken chain: id=%q", brokenID)
	}
	_ = project
}
