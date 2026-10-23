// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"
	"time"

	"zentro/internal/utils"
)

func newBatchValidationService(prefs utils.Preferences, envKey string) *QueryService {
	return &QueryService{
		getPrefs:                 func() utils.Preferences { return prefs },
		getCurrentEnvironmentKey: func() string { return envKey },
		pendingAuditMeta:         map[string]QueryAuditMeta{},
	}
}

func TestValidateBatch_EmptyStatements(t *testing.T) {
	svc := newBatchValidationService(utils.Preferences{}, "")
	err := svc.validateBatch(&queryBatch{tabID: "t1", query: "  "})
	if err == nil || !strings.Contains(err.Error(), "no executable SQL statement") {
		t.Fatalf("expected no-statement error, got %v", err)
	}
}

func TestValidateBatch_ViewModeBlocksWrites(t *testing.T) {
	svc := newBatchValidationService(utils.Preferences{ViewMode: true}, "")
	err := svc.validateBatch(&queryBatch{
		tabID:      "t1",
		statements: []string{"UPDATE users SET role = 'admin' WHERE id = 1"},
	})
	if err == nil || !strings.Contains(err.Error(), "view mode is enabled") {
		t.Fatalf("expected view-mode error, got %v", err)
	}
}

func TestValidateBatch_ViewModeAllowsSelects(t *testing.T) {
	svc := newBatchValidationService(utils.Preferences{ViewMode: true}, "")
	if err := svc.validateBatch(&queryBatch{
		tabID:      "t1",
		statements: []string{"SELECT * FROM users"},
	}); err != nil {
		t.Fatalf("expected select to pass in view mode, got %v", err)
	}
}

func TestQueryBatch_StatementCount(t *testing.T) {
	if got := (&queryBatch{}).statementCount(); got != 1 {
		t.Fatalf("empty batch should report count 1, got %d", got)
	}
	if got := (&queryBatch{statements: []string{"a", "b"}}).statementCount(); got != 2 {
		t.Fatalf("expected count 2, got %d", got)
	}
}

func TestQueryBatch_RecordWrite(t *testing.T) {
	b := &queryBatch{}
	b.recordWrite("INSERT INTO t VALUES (1)", 3)
	b.recordWrite("UPDATE t SET x = 1 WHERE id = 1", 2)
	b.recordWrite("DELETE FROM t WHERE id = 1", 1)
	b.recordWrite("CREATE TABLE other (id int)", 5)

	if b.insertedRows != 3 || b.updatedRows != 2 || b.deletedRows != 1 {
		t.Fatalf("unexpected counters: inserted=%d updated=%d deleted=%d",
			b.insertedRows, b.updatedRows, b.deletedRows)
	}
}

func TestQueryBatch_ShouldEmitProgress(t *testing.T) {
	statements := make([]string, 10)
	b := &queryBatch{statements: statements, lastProgressEmit: time.Now()}

	if !b.shouldEmitProgress(0, false) {
		t.Fatal("first statement must always emit progress")
	}
	if !b.shouldEmitProgress(len(statements)-1, false) {
		t.Fatal("last statement must always emit progress")
	}
	if !b.shouldEmitProgress(5, true) {
		t.Fatal("select statements must always emit progress")
	}

	// A middle non-select right after an emit is throttled.
	b.lastProgressEmit = time.Now()
	if b.shouldEmitProgress(5, false) {
		t.Fatal("middle statement inside the throttle window must be skipped")
	}

	// Once the interval elapses, the middle statement emits again.
	b.lastProgressEmit = time.Now().Add(-2 * progressEmitInterval)
	if !b.shouldEmitProgress(5, false) {
		t.Fatal("middle statement past the throttle window must emit")
	}
}
