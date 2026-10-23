// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestParseUnknownObject(t *testing.T) {
	cases := []struct {
		msg        string
		kind, name string
	}{
		{"SQL logic error: no such table: orders", "table", "orders"},
		{"no such column: email", "column", "email"},
		{"Table 'ts.hrm' doesn't exist", "table", "hrm"},
		{"Unknown column 'foo' in 'field list'", "column", "foo"},
		{"Invalid object name 'dbo.Employees'", "table", "Employees"},
		{"Invalid column name 'Nope'", "column", "Nope"},
	}
	for _, tc := range cases {
		kind, name, ok := ParseUnknownObject(errString(tc.msg))
		if !ok || kind != tc.kind || name != tc.name {
			t.Errorf("%q -> %s %q ok=%v, want %s %q", tc.msg, kind, name, ok, tc.kind, tc.name)
		}
	}
}

func TestValidateDDLByTokensCatchesUnbalancedParentheses(t *testing.T) {
	tokens, err := Tokenize("sqlite", "create table t(id int")
	if err != nil {
		t.Fatal(err)
	}
	got := ValidateDDLByTokens(tokens, "ddl")
	if got.Valid {
		t.Fatal("unbalanced DDL was accepted")
	}
}

type errString string

func (e errString) Error() string { return string(e) }
