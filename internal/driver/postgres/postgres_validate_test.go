// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"zentro/internal/db"
)

func mustTokenize(t *testing.T, stmt string) []db.Token {
	t.Helper()
	tokens, err := db.Tokenize("postgres", stmt)
	if err != nil {
		t.Fatalf("Tokenize(%q): %v", stmt, err)
	}
	return tokens
}

func TestMcpStatementKindMapsEveryBucket(t *testing.T) {
	cases := map[string]string{
		"select 1 from t":                "select",
		"insert into t values(1)":        "insert",
		"update t set a = 1":             "update",
		"delete from t":                  "delete",
		"create table t(id int)":         "ddl",
		"alter table t add column a int": "ddl",
		"drop table t":                   "ddl",
		"truncate t":                     "ddl",
		"merge into t using s on t.id = s.id when matched then do nothing": "other",
		"do $$ begin null; end $$": "other",
	}
	for stmt, want := range cases {
		got := mcpStatementKind(mustTokenize(t, stmt))
		if got != want {
			t.Errorf("mcpStatementKind(%q) = %q, want %q", stmt, got, want)
		}
	}
}

func TestIsDMLKindForPrepareAcceptsSelectAndWriteButNotDDL(t *testing.T) {
	dml := []string{"select 1", "insert into t values(1)", "update t set a=1", "delete from t", "merge into t using s on t.id=s.id when matched then do nothing"}
	for _, stmt := range dml {
		if !isDMLKindForPrepare(mustTokenize(t, stmt)) {
			t.Errorf("%q should be prepared against the database", stmt)
		}
	}
	notDML := []string{"create table t(id int)", "drop table t", "do $$ begin null; end $$"}
	for _, stmt := range notDML {
		if isDMLKindForPrepare(mustTokenize(t, stmt)) {
			t.Errorf("%q should not go through PREPARE", stmt)
		}
	}
}

func TestValidateDDLByTokensCatchesUnbalancedParentheses(t *testing.T) {
	result := validateDDLByTokens(mustTokenize(t, "create table t(id int, name text"), "ddl")
	if result.Valid {
		t.Fatal("an unclosed paren was accepted")
	}
	if result.CheckedBy != "tokens" {
		t.Fatalf("CheckedBy = %q, want tokens", result.CheckedBy)
	}
	if len(result.Errors) == 0 {
		t.Fatal("no error was reported for the unclosed paren")
	}
}

func TestValidateDDLByTokensAcceptsBalancedDDL(t *testing.T) {
	result := validateDDLByTokens(mustTokenize(t, "create table t(id int, name text)"), "ddl")
	if !result.Valid {
		t.Fatalf("a balanced CREATE TABLE was rejected: %+v", result)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("a valid statement carries an error: %+v", result)
	}
}

func TestValidateDDLByTokensCatchesAnExtraClosingParen(t *testing.T) {
	result := validateDDLByTokens(mustTokenize(t, "create table t(id int))"), "ddl")
	if result.Valid {
		t.Fatal("an extra closing paren was accepted")
	}
}

func TestLineAndColumnAtByteCountsNewlines(t *testing.T) {
	stmt := "select a\nfrom b\nwhere c = 1"
	// "where" starts at byte 16 (0-based): "select a\n" (9) + "from b\n" (7) = 16.
	line, col := lineAndColumnAtByte(stmt, 17) // Postgres Position is 1-based.
	if line != 3 || col != 1 {
		t.Fatalf("got line=%d col=%d, want line=3 col=1", line, col)
	}
}

func TestLineAndColumnAtByteZeroPositionMeansUnknown(t *testing.T) {
	line, col := lineAndColumnAtByte("select 1", 0)
	if line != 0 || col != 0 {
		t.Fatalf("got line=%d col=%d, want 0,0 for an unreported position", line, col)
	}
}

func TestUnknownObjectFromErrorExtractsTheQuotedName(t *testing.T) {
	cases := []struct {
		code, message, wantKind, wantName string
	}{
		{sqlStateUndefinedTable, `relation "orders" does not exist`, "table", "orders"},
		{sqlStateUndefinedColumn, `column "qty" does not exist`, "column", "qty"},
		{sqlStateUndefinedColumn, `column o.qty does not exist`, "", ""}, // no quotes to find
	}
	for _, tc := range cases {
		pgErr := &pgconn.PgError{Code: tc.code, Message: tc.message}
		kind, name, ok := unknownObjectFromError(pgErr)
		if tc.wantKind == "" {
			if ok {
				t.Errorf("%q: expected no match, got kind=%q name=%q", tc.message, kind, name)
			}
			continue
		}
		if !ok || kind != tc.wantKind || name != tc.wantName {
			t.Errorf("%q: got kind=%q name=%q ok=%v, want kind=%q name=%q", tc.message, kind, name, ok, tc.wantKind, tc.wantName)
		}
	}
}

func TestUnknownObjectFromErrorIgnoresOtherSQLStates(t *testing.T) {
	pgErr := &pgconn.PgError{Code: "42601", Message: `syntax error at or near "foo"`}
	if _, _, ok := unknownObjectFromError(pgErr); ok {
		t.Fatal("a syntax error was treated as an unknown object")
	}
}

func TestPostgresValidationErrorFallsBackWhenNotAPgError(t *testing.T) {
	valErr, unknown := postgresValidationError("select 1", errors.New("connection reset"))
	if valErr.Message != "connection reset" {
		t.Fatalf("got message %q", valErr.Message)
	}
	if unknown != nil {
		t.Fatalf("unexpected unknown objects: %+v", unknown)
	}
}

// --- Live Postgres: ValidateStatement end to end ---

func TestValidateStatement_ValidSelectAgainstARealTable(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupValidateSchema(t, sqlDB)
	drv := New()

	result, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "select id, name from zentro_mcp_t1 where id = 1")
	if err != nil {
		t.Fatalf("ValidateStatement: %v", err)
	}
	if !result.Valid || result.CheckedBy != "database" {
		t.Fatalf("a valid select was rejected: %+v", result)
	}
}

func TestValidateStatement_UndefinedColumnIsDataNotAToolError(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupValidateSchema(t, sqlDB)
	drv := New()

	result, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "select id, nope from zentro_mcp_t1")
	if err != nil {
		t.Fatalf("ValidateStatement returned a tool error instead of invalid data: %v", err)
	}
	if result.Valid {
		t.Fatal("a reference to a missing column was accepted")
	}
	if len(result.Errors) != 1 {
		t.Fatalf("expected exactly one error, got %+v", result.Errors)
	}
	got := result.Errors[0]
	if got.SQLState != sqlStateUndefinedColumn {
		t.Fatalf("got SQLState %q, want %q", got.SQLState, sqlStateUndefinedColumn)
	}
	if got.Line == 0 && got.Col == 0 {
		t.Fatalf("Position did not come through as a line/col: %+v", got)
	}
	if len(result.UnknownObjects) != 1 || result.UnknownObjects[0].Name != "nope" {
		t.Fatalf("unknownObjects did not name the missing column: %+v", result.UnknownObjects)
	}
}

func TestValidateStatement_UndefinedTable(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupValidateSchema(t, sqlDB)
	drv := New()

	result, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "select * from zentro_mcp_does_not_exist")
	if err != nil {
		t.Fatal(err)
	}
	if result.Valid {
		t.Fatal("a reference to a missing table was accepted")
	}
	if len(result.UnknownObjects) != 1 || result.UnknownObjects[0].Kind != "table" {
		t.Fatalf("unknownObjects did not name the missing table: %+v", result.UnknownObjects)
	}
}

func TestValidateStatement_NothingIsEverExecuted(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupValidateSchema(t, sqlDB)
	drv := New()

	var before int
	if err := sqlDB.QueryRow("select count(*) from " + schema + ".zentro_mcp_t1").Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "delete from zentro_mcp_t1"); err != nil {
		t.Fatal(err)
	}
	if _, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "insert into zentro_mcp_t1(id, name) values (99, 'x')"); err != nil {
		t.Fatal(err)
	}
	var after int
	if err := sqlDB.QueryRow("select count(*) from " + schema + ".zentro_mcp_t1").Scan(&after); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatalf("validate_sql changed the table: before=%d after=%d", before, after)
	}
}

func TestValidateStatement_DDLIsTokenCheckedOnly(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupValidateSchema(t, sqlDB)
	drv := New()

	result, err := drv.ValidateStatement(context.Background(), sqlDB, schema, "alter table zentro_mcp_t1 add column extra int")
	if err != nil {
		t.Fatal(err)
	}
	if result.CheckedBy != "tokens" {
		t.Fatalf("DDL should be token-checked, got CheckedBy=%q", result.CheckedBy)
	}
	if !result.Valid {
		t.Fatalf("a balanced, well-formed ALTER TABLE was rejected: %+v", result)
	}

	var exists bool
	if err := sqlDB.QueryRow(`select exists(select 1 from information_schema.columns where table_schema = $1 and table_name = 'zentro_mcp_t1' and column_name = 'extra')`, schema).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("validate_sql executed a DDL statement")
	}
}

// setupValidateSchema creates a fresh schema with one small table, dropped
// at the end of the test, so these tests do not depend on or disturb
// whatever else lives in the test database.
func setupValidateSchema(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	schema := "zentro_mcp_validate_test"
	ctx := context.Background()
	if _, err := sqlDB.ExecContext(ctx, "drop schema if exists "+schema+" cascade"); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "create schema "+schema); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "create table "+schema+".zentro_mcp_t1 (id int primary key, name text)"); err != nil {
		t.Fatal(err)
	}
	if _, err := sqlDB.ExecContext(ctx, "insert into "+schema+".zentro_mcp_t1 (id, name) values (1, 'a'), (2, 'b')"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade")
	})
	return schema
}
