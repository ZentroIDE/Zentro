// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"
)

func TestFormatSQL(t *testing.T) {
	svc := NewQueryFormatterService(nil)

	tests := []struct {
		name    string
		query   string
		dialect string
		wantErr bool
	}{
		{name: "postgres", query: "select id,name from users where active=1", dialect: "postgres"},
		{name: "mysql", query: "select * from orders where amount>10 and status='ok'", dialect: "mysql"},
		{name: "sqlserver", query: "select top 10 * from logs order by created_at desc", dialect: "sqlserver"},
		{name: "sqlite", query: "select * from sqlite_master where type='table'", dialect: "sqlite"},
		{name: "invalid", query: "select 1", dialect: "oracle", wantErr: true},
		{name: "empty", query: "   ", dialect: "postgres", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.FormatSQL(tt.query, tt.dialect)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got == "" {
				t.Fatalf("expected formatted output")
			}
		})
	}
}

func TestFormatSQLComments(t *testing.T) {
	svc := NewQueryFormatterService(nil)

	tests := []struct {
		name            string
		query           string
		wantSubstring   string
		wantNoSubstring string
	}{
		{
			name:          "inline line comment preserved",
			query:         "select id from users -- get all users",
			wantSubstring: "-- get all users",
		},
		{
			name:            "line comment with keywords inside not split",
			query:           "select id from users -- SELECT FROM WHERE",
			wantSubstring:   "-- SELECT FROM WHERE",
			wantNoSubstring: "-- SELECT\n",
		},
		{
			name:          "block comment preserved",
			query:         "/* get users */ select id from users",
			wantSubstring: "/* get users */",
		},
		{
			name:            "block comment with embedded keywords not split",
			query:           "select id /* SELECT id FROM orders */ from users",
			wantSubstring:   "/* SELECT id FROM orders */",
			wantNoSubstring: "/* SELECT\n",
		},
		{
			name:          "inline comment before clause",
			query:         "select id -- pick id\nfrom users",
			wantSubstring: "-- pick id",
		},
		{
			name:          "double-dash inside single-quoted string not treated as comment",
			query:         "select '-- not a comment' from t",
			wantSubstring: "'-- not a comment'",
		},
		{
			name:          "double-dash inside double-quoted identifier not treated as comment",
			query:         `select "col--name" from t`,
			wantSubstring: `"col--name"`,
		},
		{
			name:          "multiline block comment preserved",
			query:         "select id\n/* line one\n   line two */\nfrom users",
			wantSubstring: "/* line one\n   line two */",
		},
		{
			name:          "standalone line comment not broken",
			query:         "-- commented out\nselect id from users",
			wantSubstring: "-- commented out",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.FormatSQL(tt.query, "postgres")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantSubstring != "" && !strings.Contains(got, tt.wantSubstring) {
				t.Errorf("output missing %q\ngot:\n%s", tt.wantSubstring, got)
			}
			if tt.wantNoSubstring != "" && strings.Contains(got, tt.wantNoSubstring) {
				t.Errorf("output must NOT contain %q\ngot:\n%s", tt.wantNoSubstring, got)
			}
		})
	}
}
