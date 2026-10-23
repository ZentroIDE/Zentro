// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"

	"zentro/internal/utils"
)

func TestFormatSQLTSQLGolden(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "select with joins, brackets and N string",
			query: "select top 10 a.id,[my col],count(*) c from dbo.users a inner join orders o on a.id=o.uid and o.x>1 where a.name=N'bob' and a.d between 1 and 5 group by a.id order by 1 desc",
			want: `SELECT TOP 10
  a.id,
  [my col],
  COUNT(*) c
FROM dbo.users a
INNER JOIN orders o ON a.id = o.uid
  AND o.x > 1
WHERE a.name = N'bob'
  AND a.d BETWEEN 1 AND 5
GROUP BY a.id
ORDER BY 1 DESC`,
		},
		{
			name:  "CTEs and subquery",
			query: "with x as (select id from t where a=1), y as (select 1 z) select * from x join y on x.id=y.z where id in (select id from q)",
			want: `WITH x AS (
  SELECT id
  FROM t
  WHERE a = 1
),
y AS (
  SELECT 1 z
)
SELECT *
FROM x
JOIN y ON x.id = y.z
WHERE id IN (
  SELECT id
  FROM q
)`,
		},
		{
			name:  "batches, try/catch and case",
			query: "declare @a int, @b varchar(10)\nset @a=1\nbegin try\n update t set a=1,b=2 where id=@a\nend try\nbegin catch\n select error_message() -- boom\nend catch\nGO\nselect case when a>1 then 'x' else 'y' end as k from t",
			want: `DECLARE @a int,
  @b varchar(10)
SET @a = 1
BEGIN TRY
  UPDATE t
  SET
    a = 1,
    b = 2
  WHERE id = @a
END TRY
BEGIN CATCH
  SELECT error_message() -- boom
END CATCH

GO

SELECT CASE
  WHEN a > 1 THEN 'x'
  ELSE 'y'
END AS k
FROM t`,
		},
		{
			name:  "insert values and statement separator",
			query: "insert into t (a,b) values (1,2),(3,4); select -1, a::int from x;",
			want: `INSERT INTO t (a, b)
VALUES
  (1, 2),
  (3, 4);

SELECT
  -1,
  a::int
FROM x;`,
		},
		{
			name:  "merge",
			query: "merge into t as tg using s as sr on tg.id=sr.id when matched then update set a=sr.a when not matched then insert (a) values (sr.a);",
			want: `MERGE INTO t AS tg
USING s AS sr ON tg.id = sr.id
WHEN MATCHED THEN
  UPDATE SET a = sr.a
WHEN NOT MATCHED THEN
  INSERT (a) VALUES (sr.a);`,
		},
		{
			name:  "create table",
			query: "create table t (id int not null, name varchar(10)); select 1",
			want: `CREATE TABLE t (
  id int NOT NULL,
  name varchar(10)
);

SELECT 1`,
		},
		{
			name:  "leading semicolon before a CTE stays glued",
			query: ";with a as (select 1 x) select * from a",
			want: `;WITH a AS (
  SELECT 1 x
)
SELECT *
FROM a`,
		},
		{
			name:  "if/else with begin blocks",
			query: "if @a=1 begin select 1 end else begin select 2 end",
			want: `IF @a = 1
BEGIN
  SELECT 1
END
ELSE
BEGIN
  SELECT 2
END`,
		},
		{
			name:  "cross apply",
			query: "select * from a cross apply (select top 1 * from b where b.id=a.id order by b.d) x outer apply f(a.id) y",
			want: `SELECT *
FROM a
CROSS APPLY (
  SELECT TOP 1 *
  FROM b
  WHERE b.id = a.id
  ORDER BY b.d
) x
OUTER APPLY f(a.id) y`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := formatSQLWithOptions(tt.query, "sqlserver", utils.SQLFormatPrefs{})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("mismatch\n--- got ---\n%s\n--- want ---\n%s", got, tt.want)
			}
			again, err := formatSQLWithOptions(got, "sqlserver", utils.SQLFormatPrefs{})
			if err != nil {
				t.Fatalf("second pass: %v", err)
			}
			if again != got {
				t.Fatalf("formatter is not idempotent\n--- first ---\n%s\n--- second ---\n%s", got, again)
			}
		})
	}
}

func TestFormatSQLOptions(t *testing.T) {
	const query = "select a,b from t where x=1 and y=2 -- c\nunion all select 1,2"

	t.Run("lower keywords, leading commas, trailing AND, tabs", func(t *testing.T) {
		got, err := formatSQLWithOptions(query, "postgres", utils.SQLFormatPrefs{
			KeywordCase:   "lower",
			CommaPosition: "leading",
			AndOrPosition: "trailing",
			UseTabs:       true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "select\n\ta\n\t, b\nfrom t\nwhere x = 1 and\n\ty = 2 -- c\nunion all\nselect\n\t1\n\t, 2"
		if got != want {
			t.Fatalf("mismatch\n--- got ---\n%q\n--- want ---\n%q", got, want)
		}
	})

	t.Run("preserve keyword case", func(t *testing.T) {
		got, err := formatSQLWithOptions("Select a From T Where a=1", "sqlserver", utils.SQLFormatPrefs{KeywordCase: "preserve"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if want := "Select a\nFrom T\nWhere a = 1"; got != want {
			t.Fatalf("got %q want %q", got, want)
		}
	})

	t.Run("indent size", func(t *testing.T) {
		got, err := formatSQLWithOptions("select a,b from t", "sqlserver", utils.SQLFormatPrefs{IndentSize: 4})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if want := "SELECT\n    a,\n    b\nFROM t"; got != want {
			t.Fatalf("got %q want %q", got, want)
		}
	})
}

func TestFormatSQLKeepsLiteralsAndDialectSyntax(t *testing.T) {
	tests := []struct {
		name    string
		query   string
		dialect string
		want    string
	}{
		{"escaped quote and dashes in string", "select 'it''s -- not a comment' from t", "postgres", "'it''s -- not a comment'"},
		{"bracket identifier with spaces and comma", "select [a, b (c)] from [my table]", "sqlserver", "[a, b (c)]"},
		{"postgres array subscript", "select arr[1] from t", "postgres", "arr[1]"},
		{"cast operator", "select x::text from t", "postgres", "x::text"},
		{"named parameter", "select * from t where id = :id", "postgres", ":id"},
		{"temp table and variable", "select * from #tmp where a = @x", "sqlserver", "#tmp"},
		{"function call has no space", "select count (*) from t", "sqlserver", "COUNT(*)"},
		{"dollar quoted string", "select $$a, b; c$$ from t", "postgres", "$$a, b; c$$"},
		{"mysql backtick identifier", "select `a b` from `t`", "mysql", "`a b`"},
		{"operators are spaced", "select a from t where a=1 and b>=2 and c<>3", "sqlserver", "a = 1"},
		{"GO with count", "select 1\nGO 3\nselect 2", "sqlserver", "GO 3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := formatSQLWithOptions(tt.query, tt.dialect, utils.SQLFormatPrefs{})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(got, tt.want) {
				t.Fatalf("output missing %q\ngot:\n%s", tt.want, got)
			}
		})
	}
}

func TestFormatSQLNeverFailsOnMalformedInput(t *testing.T) {
	for _, q := range []string{"select (", "select )", "select 'unterminated", "select [oops", "/* open", "end end end", "begin begin"} {
		if _, err := formatSQLWithOptions(q, "sqlserver", utils.SQLFormatPrefs{}); err != nil {
			t.Errorf("%q: unexpected error %v", q, err)
		}
	}
}

func TestFormatSQLServiceReadsPrefsPerCall(t *testing.T) {
	prefs := utils.SQLFormatPrefs{}
	svc := NewQueryFormatterService(func() utils.SQLFormatPrefs { return prefs })

	upper, _ := svc.FormatSQL("select a from t", "sqlserver")
	prefs.KeywordCase = "lower"
	lower, _ := svc.FormatSQL("select a from t", "sqlserver")

	if upper != "SELECT a\nFROM t" || lower != "select a\nfrom t" {
		t.Fatalf("prefs change not applied: upper=%q lower=%q", upper, lower)
	}
}
