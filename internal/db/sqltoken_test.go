// SPDX-License-Identifier: GPL-3.0-only

package db

import (
	"errors"
	"testing"
)

type wantTok struct {
	kind TokenKind
	text string
}

func assertTokenize(t *testing.T, driver, sql string, want []wantTok) {
	t.Helper()
	tokens, err := Tokenize(driver, sql)
	if err != nil {
		t.Fatalf("Tokenize(%q, %q) error: %v", driver, sql, err)
	}
	if len(tokens) != len(want) {
		t.Fatalf("Tokenize(%q, %q): got %d tokens %v, want %d", driver, sql, len(tokens), tokens, len(want))
	}
	for i := range want {
		if tokens[i].Kind != want[i].kind || tokens[i].Text != want[i].text {
			t.Errorf("Tokenize(%q, %q) token[%d]: got {%v %q}, want {%v %q}",
				driver, sql, i, tokens[i].Kind, tokens[i].Text, want[i].kind, want[i].text)
		}
	}
}

func TestTokenize_Strings_Postgres(t *testing.T) {
	cases := []struct {
		sql  string
		text string
	}{
		{`'abc'`, `'abc'`},
		{`'it''s'`, `'it''s'`},
		{`E'it\'s'`, `E'it\'s'`},
		{`B'1010'`, `B'1010'`},
		{`X'1F'`, `X'1F'`},
		{`$$body$$`, `$$body$$`},
		{`$tag$body$tag$`, `$tag$body$tag$`},
		{`$a$outer $b$inner$b$ outer$a$`, `$a$outer $b$inner$b$ outer$a$`},
	}
	for _, c := range cases {
		tokens, err := Tokenize("postgres", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(postgres, %q) error: %v", c.sql, err)
		}
		if len(tokens) != 1 {
			t.Fatalf("Tokenize(postgres, %q): got %d tokens, want 1: %v", c.sql, len(tokens), tokens)
		}
		if tokens[0].Kind != TokenString || tokens[0].Text != c.text {
			t.Errorf("Tokenize(postgres, %q): got {%v %q}, want {%v %q}", c.sql, tokens[0].Kind, tokens[0].Text, TokenString, c.text)
		}
	}
}

func TestTokenize_Strings_MySQL(t *testing.T) {
	cases := []struct {
		sql  string
		kind TokenKind
		text string
	}{
		{`'abc'`, TokenString, `'abc'`},
		{`'it\'s'`, TokenString, `'it\'s'`},
		{"`col`", TokenQuotedIdentifier, "`col`"},
		{`"str"`, TokenString, `"str"`},
	}
	for _, c := range cases {
		tokens, err := Tokenize("mysql", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(mysql, %q) error: %v", c.sql, err)
		}
		if len(tokens) != 1 {
			t.Fatalf("Tokenize(mysql, %q): got %d tokens, want 1: %v", c.sql, len(tokens), tokens)
		}
		if tokens[0].Kind != c.kind || tokens[0].Text != c.text {
			t.Errorf("Tokenize(mysql, %q): got {%v %q}, want {%v %q}", c.sql, tokens[0].Kind, tokens[0].Text, c.kind, c.text)
		}
	}
}

func TestTokenize_Strings_SQLServer(t *testing.T) {
	cases := []struct {
		sql  string
		kind TokenKind
		text string
	}{
		{`'abc'`, TokenString, `'abc'`},
		{`N'abc'`, TokenString, `N'abc'`},
		{`[My Table]`, TokenQuotedIdentifier, `[My Table]`},
		{`"My Table"`, TokenQuotedIdentifier, `"My Table"`},
	}
	for _, c := range cases {
		tokens, err := Tokenize("sqlserver", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(sqlserver, %q) error: %v", c.sql, err)
		}
		if len(tokens) != 1 {
			t.Fatalf("Tokenize(sqlserver, %q): got %d tokens, want 1: %v", c.sql, len(tokens), tokens)
		}
		if tokens[0].Kind != c.kind || tokens[0].Text != c.text {
			t.Errorf("Tokenize(sqlserver, %q): got {%v %q}, want {%v %q}", c.sql, tokens[0].Kind, tokens[0].Text, c.kind, c.text)
		}
	}
}

func TestTokenize_Strings_SQLite(t *testing.T) {
	cases := []struct {
		sql  string
		kind TokenKind
		text string
	}{
		{`'abc'`, TokenString, `'abc'`},
		{`"My Table"`, TokenQuotedIdentifier, `"My Table"`},
		{"`col`", TokenQuotedIdentifier, "`col`"},
		{`[col]`, TokenQuotedIdentifier, `[col]`},
	}
	for _, c := range cases {
		tokens, err := Tokenize("sqlite", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(sqlite, %q) error: %v", c.sql, err)
		}
		if len(tokens) != 1 {
			t.Fatalf("Tokenize(sqlite, %q): got %d tokens, want 1: %v", c.sql, len(tokens), tokens)
		}
		if tokens[0].Kind != c.kind || tokens[0].Text != c.text {
			t.Errorf("Tokenize(sqlite, %q): got {%v %q}, want {%v %q}", c.sql, tokens[0].Kind, tokens[0].Text, c.kind, c.text)
		}
	}
}

func TestTokenize_CommentsSkipped(t *testing.T) {
	assertTokenize(t, "postgres", "SELECT 1 -- comment\nFROM t", []wantTok{
		{TokenKeyword, "select"}, {TokenNumber, "1"}, {TokenKeyword, "from"}, {TokenIdentifier, "t"},
	})
	assertTokenize(t, "postgres", "SELECT 1 /* c */ FROM t", []wantTok{
		{TokenKeyword, "select"}, {TokenNumber, "1"}, {TokenKeyword, "from"}, {TokenIdentifier, "t"},
	})
	// Nested block comments are skipped as a unit.
	assertTokenize(t, "postgres", "SELECT /* outer /* inner */ still */ 1", []wantTok{
		{TokenKeyword, "select"}, {TokenNumber, "1"},
	})
	// Comment markers inside strings are literal.
	assertTokenize(t, "postgres", "SELECT '-- not a comment'", []wantTok{
		{TokenKeyword, "select"}, {TokenString, "'-- not a comment'"},
	})
	assertTokenize(t, "postgres", "SELECT '/* not a comment */'", []wantTok{
		{TokenKeyword, "select"}, {TokenString, "'/* not a comment */'"},
	})
}

func TestTokenize_DollarQuote(t *testing.T) {
	assertTokenize(t, "postgres", "SELECT $$where$$", []wantTok{
		{TokenKeyword, "select"}, {TokenString, "$$where$$"},
	})
	// $1 is a placeholder, never a dollar quote opener.
	assertTokenize(t, "postgres", "SELECT $1", []wantTok{
		{TokenKeyword, "select"}, {TokenPlaceholder, "$1"},
	})
	assertTokenize(t, "postgres", "$tag$hello; world$tag$", []wantTok{
		{TokenString, "$tag$hello; world$tag$"},
	})
}

func TestTokenize_QuotedIdentifiers(t *testing.T) {
	assertTokenize(t, "postgres", `"My Table"`, []wantTok{{TokenQuotedIdentifier, `"My Table"`}})
	assertTokenize(t, "postgres", `"a""b"`, []wantTok{{TokenQuotedIdentifier, `"a""b"`}})
	assertTokenize(t, "mysql", "`tbl`", []wantTok{{TokenQuotedIdentifier, "`tbl`"}})
	assertTokenize(t, "sqlserver", "[tbl]", []wantTok{{TokenQuotedIdentifier, "[tbl]"}})
}

func TestTokenize_Placeholders(t *testing.T) {
	assertTokenize(t, "postgres", "SELECT $1, $10", []wantTok{
		{TokenKeyword, "select"}, {TokenPlaceholder, "$1"}, {TokenPunct, ","}, {TokenPlaceholder, "$10"},
	})
	assertTokenize(t, "mysql", "SELECT ?", []wantTok{
		{TokenKeyword, "select"}, {TokenPlaceholder, "?"},
	})
	assertTokenize(t, "sqlserver", "SELECT @p1", []wantTok{
		{TokenKeyword, "select"}, {TokenPlaceholder, "@p1"},
	})
	assertTokenize(t, "sqlite", "SELECT ?, ?1, :name, @name, $name", []wantTok{
		{TokenKeyword, "select"},
		{TokenPlaceholder, "?"}, {TokenPunct, ","},
		{TokenPlaceholder, "?1"}, {TokenPunct, ","},
		{TokenPlaceholder, ":name"}, {TokenPunct, ","},
		{TokenPlaceholder, "@name"}, {TokenPunct, ","},
		{TokenPlaceholder, "$name"},
	})
}

func TestTokenize_UnsupportedUAnd(t *testing.T) {
	for _, sql := range []string{`U&"d\0061t\+000061"`, `U&'d\0061t\+000061'`} {
		_, err := Tokenize("postgres", sql)
		if !errors.Is(err, ErrUnsupportedToken) {
			t.Fatalf("Tokenize(postgres, %q): got err %v, want ErrUnsupportedToken", sql, err)
		}
	}
}

func TestTokenize_Depth(t *testing.T) {
	tokens, err := Tokenize("postgres", "SELECT (a) FROM t")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wantDepth := []int{0, 0, 1, 0, 0, 0}
	if len(tokens) != len(wantDepth) {
		t.Fatalf("got %d tokens, want %d", len(tokens), len(wantDepth))
	}
	for i, d := range wantDepth {
		if tokens[i].Depth != d {
			t.Errorf("token[%d] %q depth = %d, want %d", i, tokens[i].Text, tokens[i].Depth, d)
		}
	}
}

func TestTokenize_Positions(t *testing.T) {
	tokens, err := Tokenize("postgres", "SELECT a\nFROM t")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []struct {
		text string
		line int
		col  int
	}{
		{"select", 1, 1},
		{"a", 1, 8},
		{"from", 2, 1},
		{"t", 2, 6},
	}
	if len(tokens) != len(want) {
		t.Fatalf("got %d tokens, want %d", len(tokens), len(want))
	}
	for i, w := range want {
		if tokens[i].Text != w.text || tokens[i].Line != w.line || tokens[i].Col != w.col {
			t.Errorf("token[%d]: got {%q line %d col %d}, want {%q line %d col %d}",
				i, tokens[i].Text, tokens[i].Line, tokens[i].Col, w.text, w.line, w.col)
		}
	}
	if tokens[0].Start != 0 || tokens[0].End != 6 {
		t.Errorf("select byte span = [%d,%d), want [0,6)", tokens[0].Start, tokens[0].End)
	}
}

func TestSplitTokens(t *testing.T) {
	tokens, err := Tokenize("", "SELECT 1; SELECT 2; SELECT 3")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	parts := SplitTokens(tokens)
	if len(parts) != 3 {
		t.Fatalf("got %d statements, want 3", len(parts))
	}

	tokens, _ = Tokenize("", "CREATE FUNCTION f() RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql; SELECT 2")
	parts = SplitTokens(tokens)
	if len(parts) != 2 {
		t.Fatalf("got %d statements, want 2 (semicolon inside dollar quote ignored)", len(parts))
	}
}

func TestFirstKeyword(t *testing.T) {
	cases := []struct {
		sql  string
		want string
	}{
		{"SELECT 1", "select"},
		{"DELETE FROM t", "delete"},
		{"WITH x AS (SELECT 1) SELECT 2", "select"},
		{"WITH x AS (SELECT 1) INSERT INTO t VALUES (1)", "insert"},
		{"WITH x AS (SELECT 1) UPDATE t SET a = 1", "update"},
		{"WITH x AS (SELECT 1 WHERE true) DELETE FROM t", "delete"},
		{"WITH x AS (SELECT 1) DELETE FROM t", "delete"},
	}
	for _, c := range cases {
		tokens, err := Tokenize("", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(%q): %v", c.sql, err)
		}
		if got := FirstKeyword(tokens); got != c.want {
			t.Errorf("FirstKeyword(%q) = %q, want %q", c.sql, got, c.want)
		}
	}
}

func TestStatementKind(t *testing.T) {
	cases := []struct {
		sql  string
		kind WriteOperation
	}{
		{"SELECT 1", WriteOperationRead},
		{"SHOW TABLES", WriteOperationRead},
		{"EXPLAIN SELECT 1", WriteOperationRead},
		{"INSERT INTO t VALUES (1)", WriteOperationInsert},
		{"UPDATE t SET a = 1", WriteOperationUpdate},
		{"DELETE FROM t", WriteOperationDelete},
		{"MERGE INTO t USING s ON t.id = s.id", WriteOperationMerge},
		{"REPLACE INTO t VALUES (1)", WriteOperationReplace},
		{"TRUNCATE TABLE t", WriteOperationTruncate},
		{"DROP TABLE t", WriteOperationDrop},
		{"ALTER TABLE t ADD COLUMN c int", WriteOperationAlter},
		{"CREATE TABLE t (id int)", WriteOperationCreate},
		{"WITH x AS (SELECT 1) SELECT 2", WriteOperationRead},
		{"WITH x AS (SELECT 1) DELETE FROM t", WriteOperationDelete},
		{"GRANT SELECT ON t TO u", WriteOperationUnknown},
	}
	for _, c := range cases {
		tokens, err := Tokenize("", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(%q): %v", c.sql, err)
		}
		if got := StatementKind(tokens); got != c.kind {
			t.Errorf("StatementKind(%q) = %q, want %q", c.sql, got, c.kind)
		}
	}
}

// TestStatementClassification covers the 30-statement table required for
// StatementKind and top-level WHERE detection (subquery, CTE, comment, string,
// FOR UPDATE).
func TestStatementClassification(t *testing.T) {
	cases := []struct {
		sql      string
		kind     WriteOperation
		hasWhere bool
	}{
		{"SELECT 1", WriteOperationRead, false},
		{"SELECT * FROM t", WriteOperationRead, false},
		{"SELECT * FROM t WHERE id = 1", WriteOperationRead, true},
		{"INSERT INTO t VALUES (1)", WriteOperationInsert, false},
		{"UPDATE t SET a = 1", WriteOperationUpdate, false},
		{"UPDATE t SET a = 1 WHERE id = 2", WriteOperationUpdate, true},
		{"DELETE FROM t", WriteOperationDelete, false},
		{"DELETE FROM t WHERE id = 3", WriteOperationDelete, true},
		{"UPDATE t SET a = 'where'", WriteOperationUpdate, false},
		{"DELETE FROM t -- where\n", WriteOperationDelete, false},
		{"SELECT * FROM (SELECT 1 WHERE true) x", WriteOperationRead, false},
		{"WITH x AS (SELECT 1 WHERE true) SELECT 1", WriteOperationRead, false},
		{"WITH x AS (SELECT 1 WHERE true) DELETE FROM t", WriteOperationDelete, false},
		{"WITH x AS (SELECT 1) UPDATE t SET a = 1 WHERE id = 2", WriteOperationUpdate, true},
		{"SELECT * FROM t FOR UPDATE", WriteOperationRead, false},
		{"TRUNCATE TABLE t", WriteOperationTruncate, false},
		{"DROP TABLE t", WriteOperationDrop, false},
		{"ALTER TABLE t ADD COLUMN c int", WriteOperationAlter, false},
		{"CREATE TABLE t (id int)", WriteOperationCreate, false},
		{"MERGE INTO t USING s ON t.id = s.id", WriteOperationMerge, false},
		{"REPLACE INTO t VALUES (1)", WriteOperationReplace, false},
		{"SELECT 'a''b'", WriteOperationRead, false},
		{"SELECT 1 WHERE 1 = 1", WriteOperationRead, true},
		{"DELETE FROM t WHERE id IN (SELECT id FROM u WHERE x = 1)", WriteOperationDelete, true},
		{"UPDATE t SET a = 1 FROM u WHERE t.id = u.id", WriteOperationUpdate, true},
		{"WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x", WriteOperationDelete, false},
		{"WITH x AS (UPDATE a SET x=1 RETURNING 1) SELECT * FROM x", WriteOperationUpdate, false},
		{"WITH x AS (INSERT INTO a VALUES (1) RETURNING 1) SELECT * FROM x", WriteOperationInsert, false},
		{"SHOW TABLES", WriteOperationRead, false},
		{"EXPLAIN SELECT 1", WriteOperationRead, false},
		{"WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x", WriteOperationInsert, false},
		{"SELECT 'where'", WriteOperationRead, false},
	}
	for _, c := range cases {
		tokens, err := Tokenize("", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(%q): %v", c.sql, err)
		}
		if got := StatementKind(tokens); got != c.kind {
			t.Errorf("StatementKind(%q) = %q, want %q", c.sql, got, c.kind)
		}
		if got := HasTopLevelKeyword(tokens, "where"); got != c.hasWhere {
			t.Errorf("HasTopLevelKeyword(%q, where) = %v, want %v", c.sql, got, c.hasWhere)
		}
	}
}

func TestHasTopLevelKeyword(t *testing.T) {
	tokens, _ := Tokenize("", "SELECT * FROM t FOR UPDATE")
	if HasTopLevelKeyword(tokens, "where") {
		t.Fatalf("FOR UPDATE must not count as a WHERE clause")
	}
	if !HasTopLevelKeyword(tokens, "for") {
		t.Fatalf("expected top-level FOR keyword")
	}
}

func TestClauseAfterTopLevel(t *testing.T) {
	tokens, _ := Tokenize("", "SELECT * FROM t WHERE id = 1 ORDER BY x")
	text, ok := ClauseAfterTopLevel(tokens, "where", "order")
	if !ok {
		t.Fatalf("expected to find top-level WHERE clause")
	}
	if text != "id = 1" {
		t.Fatalf("ClauseAfterTopLevel = %q, want %q", text, "id = 1")
	}

	tokens, _ = Tokenize("", "SELECT 1")
	if _, ok := ClauseAfterTopLevel(tokens, "where"); ok {
		t.Fatalf("expected no WHERE clause")
	}
}

func TestClauseSpanAfterTopLevel(t *testing.T) {
	sql := `UPDATE t SET a = 'x' WHERE id = 7 AND name = 'O''Brien' RETURNING id`
	tokens, err := Tokenize("", sql)
	if err != nil {
		t.Fatalf("Tokenize: %v", err)
	}
	start, end, ok := ClauseSpanAfterTopLevel(tokens, "where", "returning")
	if !ok {
		t.Fatalf("expected top-level WHERE clause")
	}
	if got := sql[start:end]; got != `WHERE id = 7 AND name = 'O''Brien'` {
		t.Fatalf("clause span = %q, want %q", got, `WHERE id = 7 AND name = 'O''Brien'`)
	}

	// A WHERE inside a subquery in SET must not be mistaken for top-level.
	sql = `UPDATE t SET a = (SELECT 1 WHERE x = 1) WHERE id = 2`
	tokens, _ = Tokenize("", sql)
	start, end, ok = ClauseSpanAfterTopLevel(tokens, "where")
	if !ok {
		t.Fatalf("expected top-level WHERE")
	}
	if got := sql[start:end]; got != `WHERE id = 2` {
		t.Fatalf("clause span = %q, want %q", got, `WHERE id = 2`)
	}

	if _, _, ok := ClauseSpanAfterTopLevel(tokens, "order"); ok {
		t.Fatalf("expected no ORDER BY clause")
	}
}

func TestCallNames(t *testing.T) {
	cases := []struct {
		sql  string
		want []string
	}{
		{"SELECT count(*), lower(name), upper(x), coalesce(a, b) FROM t", []string{"count", "lower", "upper", "coalesce"}},
		{"SELECT pg_catalog.upper(x)", []string{"upper"}},
		{`SELECT "My Func"(x)`, []string{"My Func"}},
		{"SELECT * FROM t WHERE x IN (1, 2)", nil},
		{"SELECT * FROM t WHERE EXISTS (SELECT 1)", nil},
	}
	for _, c := range cases {
		tokens, err := Tokenize("", c.sql)
		if err != nil {
			t.Fatalf("Tokenize(%q): %v", c.sql, err)
		}
		got := CallNames(tokens)
		if len(got) != len(c.want) {
			t.Fatalf("CallNames(%q) = %v, want %v", c.sql, got, c.want)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("CallNames(%q)[%d] = %q, want %q", c.sql, i, got[i], c.want[i])
			}
		}
	}
}

func TestSplitTokens_MatchSplitStatements(t *testing.T) {
	samples := []string{
		"SELECT * FROM users;",
		`SELECT id, name FROM "Users";`,
		"INSERT INTO t (a, b) VALUES (1, 2);",
		"UPDATE t SET a = 1 WHERE id = 2;",
		"DELETE FROM t WHERE id = 3;",
		"SELECT 'it''s a test';",
		"SELECT 'semi;colon';",
		"-- comment with ; semicolon\nSELECT 1;",
		"/* block ; comment */ SELECT 2;",
		`SELECT "col with ; semicolon" FROM t;`,
		"CREATE FUNCTION f() RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql;",
		"SELECT $$ a ; b $$;",
		"SELECT $tag$ body ; here $tag$;",
		"SELECT 1; SELECT 2; SELECT 3;",
		"SELECT * FROM a WHERE x = 1;\nSELECT * FROM b WHERE y = 2;",
		"WITH x AS (SELECT 1) SELECT * FROM x;",
		"WITH x AS (SELECT 1 WHERE true) DELETE FROM t;",
		"SELECT '-- not a comment';",
		"SELECT '/* not a block */';",
		"/* multi\nline\ncomment */ SELECT 1;",
		`SELECT a, b FROM "schema"."table";`,
		"SELECT * FROM t WHERE name = 'O''Brien';",
		"-- leading comment\nSELECT 42;",
		"SELECT $1, $2;",
		"DELETE FROM t -- trailing comment",
		"SELECT $$ nested $x$ inner $x$ outer $$;",
		"TRUNCATE TABLE t;",
		"SELECT * FROM t ORDER BY id DESC;",
		"INSERT INTO t VALUES ('a;b', 'c');",
		"SELECT * FROM t /* trailing block */",
		"SELECT 'dollar $ sign';",
		`CREATE TABLE "T" (id int);`,
		"SELECT * FROM t WHERE a = 1;\n\nSELECT * FROM u;",
		"SELECT 1\n;\nSELECT 2;",
		"SELECT * FROM t;SELECT * FROM u;",
		"SELECT 1 -- trailing comment",
		"SELECT `tick` FROM t;",
		"SELECT 1 /* c ; d */ FROM t;",
		"SELECT E'it''s';",
		"SELECT $tag$ a ; b $tag$, 'x';",
	}
	for _, sql := range samples {
		tokens, err := Tokenize("", sql)
		if err != nil {
			t.Fatalf("Tokenize(%q) error: %v", sql, err)
		}
		got := len(SplitTokens(tokens))
		want := len(SplitStatements(sql))
		if got != want {
			t.Errorf("SplitTokens vs SplitStatements mismatch for %q: got %d, want %d", sql, got, want)
		}
	}
}

func FuzzTokenize(f *testing.F) {
	f.Add("")
	f.Add("SELECT 1")
	f.Add("SELECT * FROM t WHERE id = $1")
	f.Add("CREATE FUNCTION f() RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql")
	f.Add("E'it\\'s'")
	f.Add("/* nested /* comment */ */ SELECT 1")
	f.Add("U&'d\\0061'")
	f.Add("WITH x AS (SELECT 1 WHERE true) DELETE FROM t")
	f.Fuzz(func(t *testing.T, sql string) {
		for _, driver := range []string{"", "postgres", "mysql", "sqlserver", "sqlite"} {
			tokens, _ := Tokenize(driver, sql)
			_ = SplitTokens(tokens)
			_ = FirstKeyword(tokens)
			_ = StatementKind(tokens)
			_ = HasTopLevelKeyword(tokens, "where")
			_ = CallNames(tokens)
			_ = NormalizeLiterals(sql)
			_ = tokenizeSQLLenient(driver, sql)
			_, _, _ = ClauseSpanAfterTopLevel(tokens, "where", "returning")
		}
		_ = AnalyzeStatementRisk(sql)
		_ = ClassifyStatementOperation(sql)
	})
}
