// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestAnalyzeStatementRisk_UpdateWithoutWhere(t *testing.T) {
	risk := AnalyzeStatementRisk("UPDATE users SET role = 'admin'")
	if !risk.UpdateNoWhere {
		t.Fatalf("expected update without where to be detected")
	}
	if !risk.Destructive {
		t.Fatalf("expected update to be destructive")
	}
}

func TestAnalyzeStatementRisk_IgnoreWhereInString(t *testing.T) {
	risk := AnalyzeStatementRisk("UPDATE users SET note = 'where here'")
	if !risk.UpdateNoWhere {
		t.Fatalf("expected where inside string to be ignored")
	}
}

func TestAnalyzeSQLRisk_MixedBatch(t *testing.T) {
	risk := AnalyzeSQLRisk(`
-- comment
UPDATE users SET name = 'alice' WHERE id = 1;
DELETE FROM sessions;
SELECT 1;
`)
	if !risk.HasWrite {
		t.Fatalf("expected write batch")
	}
	if !risk.HasDestructive {
		t.Fatalf("expected destructive batch")
	}
	if !risk.HasDeleteNoWhere {
		t.Fatalf("expected delete without where")
	}
}

func TestAnalyzeStatementRisk_CTEWhereNotTopLevel(t *testing.T) {
	risk := AnalyzeStatementRisk("WITH x AS (SELECT 1 WHERE true) DELETE FROM t")
	if risk.Operation != WriteOperationDelete {
		t.Fatalf("expected delete, got %s", risk.Operation)
	}
	if risk.HasWhere {
		t.Fatalf("expected no top-level WHERE; a CTE-internal WHERE must not count")
	}
	if !risk.DeleteNoWhere {
		t.Fatalf("expected delete without where")
	}
}

func TestAnalyzeStatementRisk_WhereInSubqueryIsTopLevel(t *testing.T) {
	risk := AnalyzeStatementRisk("UPDATE t SET a = 1 WHERE id IN (SELECT id FROM u WHERE x = 1)")
	if !risk.HasWhere {
		t.Fatalf("expected top-level WHERE")
	}
	if risk.UpdateNoWhere {
		t.Fatalf("expected update with where")
	}
}

func TestAnalyzeStatementRisk_WhereInCommentIgnored(t *testing.T) {
	risk := AnalyzeStatementRisk("DELETE FROM sessions -- where\n")
	if risk.HasWhere {
		t.Fatalf("expected no WHERE when 'where' appears only in a comment")
	}
	if !risk.DeleteNoWhere {
		t.Fatalf("expected delete without where")
	}
}

func TestAnalyzeStatementRisk_CTEWriteClassifiedAsWrite(t *testing.T) {
	cases := []struct {
		sql string
		op  WriteOperation
	}{
		{"WITH d AS (DELETE FROM a RETURNING 1) SELECT * FROM d", WriteOperationDelete},
		{"WITH d AS (UPDATE a SET x=1 RETURNING 1) SELECT * FROM d", WriteOperationUpdate},
		{"WITH d AS (INSERT INTO a VALUES (1) RETURNING 1) SELECT * FROM d", WriteOperationInsert},
		{"WITH d AS (SELECT 1) DELETE FROM d", WriteOperationDelete},
		{"WITH d AS (SELECT 1) SELECT * FROM d", WriteOperationRead},
	}
	for _, c := range cases {
		risk := AnalyzeStatementRisk(c.sql)
		if risk.Operation != c.op {
			t.Errorf("AnalyzeStatementRisk(%q).Operation = %q, want %q", c.sql, risk.Operation, c.op)
		}
	}
}

func TestAnalyzeStatementRisk_TokenizeErrorLenientFallback(t *testing.T) {
	cases := []struct {
		sql           string
		op            WriteOperation
		updateNoWhere bool
		deleteNoWhere bool
	}{
		{"WITH a AS (SELECT U&'x') DELETE FROM t", WriteOperationDelete, false, true},
		{`DELETE FROM U&"t" WHERE id=1`, WriteOperationDelete, false, false},
		{"UPDATE t SET a = U&'x'", WriteOperationUpdate, true, false},
		{`TRUNCATE U&"t"`, WriteOperationTruncate, false, false},
	}
	for _, c := range cases {
		risk := AnalyzeStatementRisk(c.sql)
		if risk.Operation != c.op {
			t.Errorf("AnalyzeStatementRisk(%q).Operation = %q, want %q", c.sql, risk.Operation, c.op)
		}
		if risk.UpdateNoWhere != c.updateNoWhere {
			t.Errorf("AnalyzeStatementRisk(%q).UpdateNoWhere = %v, want %v", c.sql, risk.UpdateNoWhere, c.updateNoWhere)
		}
		if risk.DeleteNoWhere != c.deleteNoWhere {
			t.Errorf("AnalyzeStatementRisk(%q).DeleteNoWhere = %v, want %v", c.sql, risk.DeleteNoWhere, c.deleteNoWhere)
		}
	}

	// The batch-level aggregate must also fail closed.
	risk := AnalyzeSQLRisk("WITH a AS (SELECT U&'x') DELETE FROM t")
	if !risk.HasWrite {
		t.Fatalf("expected HasWrite for a write hidden behind an unsupported token")
	}
	if !risk.HasDeleteNoWhere {
		t.Fatalf("expected HasDeleteNoWhere for a no-WHERE delete hidden behind an unsupported token")
	}
}
