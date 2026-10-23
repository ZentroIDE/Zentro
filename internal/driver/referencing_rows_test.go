// SPDX-License-Identifier: GPL-3.0-only

package driver_test

import (
	"reflect"
	"strings"
	"testing"

	"zentro/internal/driver"
	"zentro/internal/driver/mssql"
	"zentro/internal/driver/mysql"
	"zentro/internal/driver/postgres"
	"zentro/internal/driver/sqlite"
)

func pgMarker(n int) string    { return "$" + string(rune('0'+n)) }
func qMarker(int) string       { return "?" }
func mssqlMarker(n int) string { return "@p" + string(rune('0'+n)) }

func TestBuildReferencingRowsQuery_SingleColumn(t *testing.T) {
	query, args, err := driver.BuildReferencingRowsQuery(
		postgres.New(), pgMarker, "public", "order_details", []string{"order_id"},
		[][]string{{"10248"}, {"10249"}},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := `SELECT 1 FROM "public"."order_details" WHERE "order_id" IN ($1, $2)`
	if query != want {
		t.Fatalf("query = %q, want %q", query, want)
	}
	if !reflect.DeepEqual(args, []any{"10248", "10249"}) {
		t.Fatalf("args = %#v", args)
	}
}

func TestBuildReferencingRowsQuery_CompositeKeySpelledOutForEveryDialect(t *testing.T) {
	query, args, err := driver.BuildReferencingRowsQuery(
		mssql.New(), mssqlMarker, "dbo", "child", []string{"tenant_id", "user_id"},
		[][]string{{"1", "7"}, {"1", "8"}},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := `SELECT 1 FROM "dbo"."child" WHERE ("tenant_id" = @p1 AND "user_id" = @p2) OR ("tenant_id" = @p3 AND "user_id" = @p4)`
	if query != want {
		t.Fatalf("query = %q, want %q", query, want)
	}
	if !reflect.DeepEqual(args, []any{"1", "7", "1", "8"}) {
		t.Fatalf("args = %#v", args)
	}
}

func TestBuildReferencingRowsQuery_QuotingFollowsTheDialect(t *testing.T) {
	cases := []struct {
		name    string
		dialect driver.QueryDialect
		marker  driver.BindMarker
		want    string
	}{
		{"mysql", mysql.New(), qMarker, "SELECT 1 FROM `shop`.`child` WHERE `fk` IN (?)"},
		{"sqlite", sqlite.New(), qMarker, `SELECT 1 FROM "shop"."child" WHERE "fk" IN (?)`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			query, _, err := driver.BuildReferencingRowsQuery(tc.dialect, tc.marker, "shop", "child", []string{"fk"}, [][]string{{"1"}})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if query != tc.want {
				t.Fatalf("query = %q, want %q", query, tc.want)
			}
		})
	}
}

func TestBuildReferencingRowsQuery_OmitsBlankSchema(t *testing.T) {
	query, _, err := driver.BuildReferencingRowsQuery(sqlite.New(), qMarker, "  ", "child", []string{"fk"}, [][]string{{"1"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := `SELECT 1 FROM "child" WHERE "fk" IN (?)`; query != want {
		t.Fatalf("query = %q, want %q", query, want)
	}
}

func TestBuildReferencingRowsQuery_EscapesIdentifiersAndKeepsValuesOutOfTheSQL(t *testing.T) {
	query, args, err := driver.BuildReferencingRowsQuery(
		sqlite.New(), qMarker, "", `we"ird`, []string{`col"x`},
		[][]string{{"1'); DROP TABLE users; --"}},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(query, "DROP") {
		t.Fatalf("a value leaked into the statement text: %q", query)
	}
	if want := `SELECT 1 FROM "we""ird" WHERE "col""x" IN (?)`; query != want {
		t.Fatalf("query = %q, want %q", query, want)
	}
	if !reflect.DeepEqual(args, []any{"1'); DROP TABLE users; --"}) {
		t.Fatalf("args = %#v", args)
	}
}

func TestBuildReferencingRowsQuery_RejectsBadInput(t *testing.T) {
	d := sqlite.New()
	tooMany := make([][]string, driver.MaxBindParams+1)
	for i := range tooMany {
		tooMany[i] = []string{"1"}
	}
	cases := []struct {
		name    string
		table   string
		columns []string
		keys    [][]string
	}{
		{"no table", "", []string{"a"}, [][]string{{"1"}}},
		{"no columns", "t", nil, [][]string{{"1"}}},
		{"blank column", "t", []string{" "}, [][]string{{"1"}}},
		{"no keys", "t", []string{"a"}, nil},
		{"short tuple", "t", []string{"a", "b"}, [][]string{{"1"}}},
		{"long tuple", "t", []string{"a"}, [][]string{{"1", "2"}}},
		{"more parameters than one statement may bind", "t", []string{"a"}, tooMany},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := driver.BuildReferencingRowsQuery(d, qMarker, "", tc.table, tc.columns, tc.keys); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
