// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestRewriteParamsForPrepare(t *testing.T) {
	cases := []struct {
		driver, in, want string
		n                int
	}{
		{"postgres", "SELECT * FROM orders WHERE ship_country = :country LIMIT :n", "SELECT * FROM orders WHERE ship_country = $1 LIMIT $2", 2},
		{"postgres", "SELECT * FROM t WHERE a = :x OR b = :x", "SELECT * FROM t WHERE a = $1 OR b = $1", 2},
		{"postgres", "SELECT created_at::date, ':not' FROM t -- :nope\nWHERE id = :id", "SELECT created_at::date, ':not' FROM t -- :nope\nWHERE id = $1", 1},
		{"postgres", "SELECT * FROM t WHERE id = $1", "SELECT * FROM t WHERE id = $1", 0},
		{"mysql", "SELECT * FROM t WHERE a = :a AND b = ?", "SELECT * FROM t WHERE a = ? AND b = ?", 1},
		{"sqlite", "SELECT * FROM t WHERE a = :a", "SELECT * FROM t WHERE a = :a", 0},
	}
	for _, tc := range cases {
		got, n := RewriteParams(tc.driver, tc.in, ParamsForPrepare)
		if got != tc.want || n != tc.n {
			t.Fatalf("%s %q:\n got %q (%d)\nwant %q (%d)", tc.driver, tc.in, got, n, tc.want, tc.n)
		}
	}
}

func TestRewriteParamsAsNull(t *testing.T) {
	got, n := RewriteParams("postgres", "SELECT * FROM t WHERE a = :a AND b = $2 AND c = 'x'::text", ParamsAsNull)
	if got != "SELECT * FROM t WHERE a = NULL AND b = NULL AND c = 'x'::text" || n != 2 {
		t.Fatalf("got %q (%d)", got, n)
	}
	got, n = RewriteParams("mysql", "SELECT * FROM t WHERE a = ?", ParamsAsNull)
	if got != "SELECT * FROM t WHERE a = NULL" || n != 1 {
		t.Fatalf("mysql got %q (%d)", got, n)
	}
}
