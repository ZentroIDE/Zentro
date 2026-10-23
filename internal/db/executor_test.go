// SPDX-License-Identifier: GPL-3.0-only

package db

import (
	"strings"
	"testing"
)

func TestIsSelectQuery(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  bool
	}{
		{name: "select", query: "SELECT 1", want: true},
		{name: "with", query: "with cte as (select 1) select * from cte", want: true},
		{name: "show", query: "SHOW TABLES", want: true},
		{name: "explain", query: "EXPLAIN SELECT 1", want: true},
		{name: "insert", query: "INSERT INTO t VALUES (1)", want: false},
		{name: "leading line comment", query: "-- note\nSELECT 1", want: true},
		{name: "leading block comment", query: "/* note */ SELECT 1", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsSelectQuery(tt.query); got != tt.want {
				t.Fatalf("IsSelectQuery() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExtractTableFromQuery(t *testing.T) {
	schema, table := ExtractTableFromQuery(`SELECT * FROM public.users WHERE id = 1`)
	if schema != "public" || table != "users" {
		t.Fatalf("unexpected result schema=%q table=%q", schema, table)
	}

	schema, table = ExtractTableFromQuery(`SELECT * FROM [dbo].[employees]`)
	if schema != "dbo" || table != "employees" {
		t.Fatalf("unexpected bracket result schema=%q table=%q", schema, table)
	}
}

func TestSplitStatements(t *testing.T) {
	query := "SELECT ';'; -- keep semicolon\nSELECT 2; /* block;comment */ SELECT 3;"
	got := SplitStatements(query)
	if len(got) != 3 {
		t.Fatalf("expected 3 statements, got %d (%v)", len(got), got)
	}
}

func TestInjectPageClauseFallback(t *testing.T) {
	got := InjectPageClause("missing-driver", "SELECT * FROM users", 100, 200)
	want := "SELECT * FROM users LIMIT 100 OFFSET 200"
	if got != want {
		t.Fatalf("unexpected pagination query: got %q want %q", got, want)
	}
}

func TestIsReadOnlyStatement(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  bool
	}{
		{name: "select", query: "SELECT * FROM users", want: true},
		{name: "show", query: "SHOW TABLES", want: true},
		{name: "explain", query: "EXPLAIN SELECT 1", want: true},
		{name: "with select", query: "WITH cte AS (SELECT 1) SELECT * FROM cte", want: true},
		{name: "with insert", query: "WITH cte AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM cte", want: false},
		{name: "insert", query: "INSERT INTO t VALUES (1)", want: false},
		{name: "update", query: "UPDATE t SET a = 1", want: false},
		{name: "leading comments", query: "/* hello */ -- world\nSELECT 1", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsReadOnlyStatement(tt.query); got != tt.want {
				t.Fatalf("IsReadOnlyStatement() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBatchHasMutatingStatements(t *testing.T) {
	if BatchHasMutatingStatements([]string{"SELECT 1", "SHOW TABLES"}) {
		t.Fatalf("expected read-only batch to be allowed")
	}

	if !BatchHasMutatingStatements([]string{"SELECT 1", "UPDATE users SET name='x'"}) {
		t.Fatalf("expected mixed batch to be marked mutating")
	}
}

func TestSplitMSSQLBatches(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  int
	}{
		{name: "no GO stays one batch", query: "DECLARE @x INT = 1;\nSELECT @x;", want: 1},
		{name: "splits on standalone GO", query: "SELECT 1;\nGO\nSELECT 2;", want: 2},
		{name: "GO with repeat count", query: "SELECT 1;\nGO 3\nSELECT 2;", want: 2},
		{name: "commented-out go is not a separator", query: "SELECT 1; --go\nSELECT 2;", want: 1},
		{name: "go inside a string is not a separator", query: "SELECT 'GO';\nSELECT 2;", want: 1},
		{name: "go inside a block comment is not a separator", query: "/*\nGO\n*/\nSELECT 1;", want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SplitMSSQLBatches(tt.query); len(got) != tt.want {
				t.Fatalf("SplitMSSQLBatches() = %d batches, want %d (%v)", len(got), tt.want, got)
			}
		})
	}
}

func TestSplitStatementsForDriver_NonMSSQLUnchanged(t *testing.T) {
	query := "SELECT 1; SELECT 2;"
	got := SplitStatementsForDriver("postgres", query)
	want := SplitStatements(query)
	if len(got) != len(want) {
		t.Fatalf("expected postgres to keep semicolon splitting, got %v want %v", got, want)
	}
}

func TestSplitStatementsForDriver_MSSQLKeepsIndependentStatementsSeparate(t *testing.T) {
	query := "SELECT * FROM Users; SELECT * FROM Orders;"
	got := SplitStatementsForDriver("sqlserver", query)
	if len(got) != 2 {
		t.Fatalf("expected 2 independent statements, got %d (%v)", len(got), got)
	}
}

func TestSplitStatementsForDriver_MSSQLCombinesVariableScopedStatements(t *testing.T) {
	query := "DECLARE @name sysname = N'namnh';\nIF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @name)\nBEGIN\n    PRINT 'missing';\nEND"
	got := SplitStatementsForDriver("sqlserver", query)
	if len(got) != 1 {
		t.Fatalf("expected DECLARE+IF/BEGIN/END to stay one combined statement, got %d (%v)", len(got), got)
	}
	if !strings.Contains(got[0], "@name") || !strings.Contains(got[0], "END") {
		t.Fatalf("combined statement lost content: %q", got[0])
	}
}

func TestSplitStatements_DollarQuoting(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  int
	}{
		{name: "DO block with inner semicolons", query: "DO $$ BEGIN RAISE NOTICE 'a'; RAISE NOTICE 'b'; END $$;", want: 1},
		{name: "tagged body", query: "CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql; SELECT 2;", want: 2},
		{name: "statements around a DO block", query: "SELECT 1; DO $$ BEGIN PERFORM 1; END $$; SELECT 3;", want: 3},
		{name: "parameter placeholders are not quotes", query: "SELECT $1; SELECT $2;", want: 2},
		{name: "identifier containing dollar is not a quote", query: "SELECT a$b$c; SELECT 2;", want: 2},
		{name: "dollar signs inside a string", query: "SELECT '$$'; SELECT 2;", want: 2},
		{name: "inner tag differs from outer", query: "DO $a$ BEGIN EXECUTE $b$ SELECT 1; $b$; END $a$; SELECT 2;", want: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SplitStatements(tt.query); len(got) != tt.want {
				t.Fatalf("SplitStatements() = %d statements, want %d (%q)", len(got), tt.want, got)
			}
		})
	}
}

func BenchmarkSplitStatements(b *testing.B) {
	query := `
SELECT * FROM users WHERE id = 1;
SELECT * FROM orders WHERE note = ';inside';
/* comment with ; */
SELECT * FROM products;
`
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = SplitStatements(query)
	}
}

func BenchmarkInjectPageClauseFallback(b *testing.B) {
	query := "SELECT id, name, created_at FROM huge_table WHERE status = 'active'"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = InjectPageClause("missing-driver", query, 500, i%1000)
	}
}
