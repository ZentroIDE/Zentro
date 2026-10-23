// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestNormalizeLiterals(t *testing.T) {
	cases := []struct {
		sql  string
		want string
	}{
		{"SELECT 1", "select ?"},
		{"SELECT 1.5", "select ?"},
		{"SELECT .5", "select ?"},
		{"SELECT 1e3", "select ?"},
		{"SELECT 1.5e-3", "select ?"},
		{"SELECT 0x1F", "select ?"},
		{`SELECT E'it\'s'`, "select ?"},
		{"SELECT $$body$$", "select ?"},
		{"SELECT $tag$hello$tag$", "select ?"},
		{`SELECT "My Table"`, `select "My Table"`},
		{"SELECT id FROM t WHERE id = 1 AND name = 'alice'", "select id from t where id = ? and name = ?"},
		{"SELECT * FROM t WHERE id = $1", "select * from t where id = $1"},
	}
	for _, c := range cases {
		if got := NormalizeLiterals(c.sql); got != c.want {
			t.Errorf("NormalizeLiterals(%q) = %q, want %q", c.sql, got, c.want)
		}
	}
}

func TestNormalizeLiterals_PreservesQuotedIdentifier(t *testing.T) {
	got := NormalizeLiterals(`UPDATE "My Table" SET note = 'secret' WHERE id = 7`)
	want := `update "My Table" set note = ? where id = ?`
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
