// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestParseCountTargetSupportedAndOutOfScope(t *testing.T) {
	supported := []struct {
		sql, kind, table string
		noWhere          bool
	}{
		{"UPDATE t SET x = 1 WHERE id = 1", "update", "t", false},
		{"UPDATE t SET x = 1 WHERE id IN (SELECT id FROM t WHERE x = 0)", "update", "t", false},
		{"UPDATE ONLY t SET x = 1 WHERE id = 1", "update", "t", false},
		{"UPDATE t AS u SET x = 1 WHERE u.id = 1", "update", "t", false},
		{"UPDATE t u SET x = 1 WHERE u.id = 1", "update", "t", false},
		{`UPDATE "t" SET x = 1 WHERE id = 1`, "update", "t", false},
		{"UPDATE t SET x = 1", "update", "t", true},
		{"UPDATE t SET x = 1 WHERE id = 1 RETURNING x", "update", "t", false},
		{"DELETE FROM t WHERE id = 1", "delete", "t", false},
		{"DELETE FROM t WHERE id IN (SELECT id FROM t WHERE x = 0)", "delete", "t", false},
		{"DELETE FROM t", "delete", "t", true},
		{"DELETE FROM t AS u WHERE u.id = 1", "delete", "t", false},
		{"DELETE FROM t u WHERE u.id = 1", "delete", "t", false},
		{"DELETE FROM t WHERE id = 1 RETURNING *", "delete", "t", false},
		{"UPDATE t SET x = (SELECT 1) WHERE id = 1", "update", "t", false},
		{"DELETE FROM t WHERE EXISTS (SELECT 1 FROM t t2 WHERE t2.id = t.id)", "delete", "t", false},
		{"UPDATE t SET x = 1 WHERE id = 1 AND x IS NOT NULL", "update", "t", false},
		{"DELETE FROM t WHERE id BETWEEN 1 AND 10", "delete", "t", false},
		{"UPDATE t SET x = 1, y = 2 WHERE id = 1", "update", "t", false},
		{"DELETE FROM t WHERE id = 1 OR id = 2", "delete", "t", false},
	}
	if len(supported) != 20 {
		t.Fatalf("need 20 supported cases, got %d", len(supported))
	}
	for _, tc := range supported {
		got, err := ParseCountTarget("postgres", tc.sql, false)
		if err != nil {
			t.Fatalf("%s: %s", tc.sql, err.Message)
		}
		if got.Kind != tc.kind || got.Table != tc.table || got.NoWhere != tc.noWhere {
			t.Fatalf("%s: got kind=%s table=%s noWhere=%v", tc.sql, got.Kind, got.Table, got.NoWhere)
		}
	}

	outOfScope := []struct {
		sql, reason string
	}{
		{"WITH x AS (SELECT 1) UPDATE t SET x = 1 WHERE id = 1", "has_cte"},
		{"UPDATE t SET x = 1 FROM t2 WHERE t.id = t2.id", "has_join"},
		{"DELETE FROM t USING t2 WHERE t.id = t2.id", "has_join"},
		{"UPDATE t SET x = $1", "has_placeholder"},
		{"UPDATE t SET x = ?", "has_placeholder"},
		{"UPDATE t SET x = 1 WHERE id = 1; UPDATE t SET x = 2", "multiple_statements"},
		{"MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET x = 1", "merge"},
		{"UPDATE SET x = 1", "ambiguous_table"},
		{`UPDATE U&"t" SET x = 1 WHERE id = 1`, "unsupported_token"},
	}
	for _, tc := range outOfScope {
		_, err := ParseCountTarget("postgres", tc.sql, false)
		if err == nil || err.Reason != tc.reason {
			t.Fatalf("%s: got %+v, want reason %s", tc.sql, err, tc.reason)
		}
	}
	_, err := ParseCountTarget("postgres", "SELECT * FROM t", false)
	if err == nil || err.Code != GuardSQLNotAllowed {
		t.Fatalf("select: %+v", err)
	}
}
