// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"strings"
	"testing"
)

func TestInjectPageClause(t *testing.T) {
	d := New()

	tests := []struct {
		name        string
		query       string
		limit       int
		offset      int
		wantContain string
		wantSuffix  string
		unchanged   bool
	}{
		{
			name:        "adds ORDER BY (SELECT NULL) when no ORDER BY",
			query:       "SELECT id, name FROM users WHERE active = 1",
			limit:       101,
			offset:      0,
			wantContain: "ORDER BY (SELECT NULL)",
			wantSuffix:  "OFFSET 0 ROWS FETCH NEXT 101 ROWS ONLY",
		},
		{
			name:        "preserves existing ORDER BY",
			query:       "SELECT id FROM t ORDER BY id DESC",
			limit:       101,
			offset:      0,
			wantContain: "ORDER BY id DESC",
			wantSuffix:  "OFFSET 0 ROWS FETCH NEXT 101 ROWS ONLY",
		},
		{
			name:      "passthrough when query already has OFFSET",
			query:     "SELECT id FROM t ORDER BY id OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY",
			limit:     101,
			offset:    0,
			unchanged: true,
		},
		{
			name:      "passthrough when query already has TOP",
			query:     "SELECT TOP 100 id FROM t",
			limit:     101,
			offset:    0,
			unchanged: true,
		},
		{
			name:        "strips trailing semicolon before appending",
			query:       "SELECT id FROM t WHERE col = 'val';",
			limit:       101,
			offset:      0,
			wantContain: "ORDER BY (SELECT NULL)",
			wantSuffix:  "OFFSET 0 ROWS FETCH NEXT 101 ROWS ONLY",
		},
		{
			name:       "non-zero offset",
			query:      "SELECT id FROM t",
			limit:      101,
			offset:     100,
			wantSuffix: "OFFSET 100 ROWS FETCH NEXT 101 ROWS ONLY",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := d.InjectPageClause(tt.query, tt.limit, tt.offset)
			if tt.unchanged {
				if got != tt.query {
					t.Fatalf("expected query unchanged\ngot:  %q\nwant: %q", got, tt.query)
				}
				return
			}
			if tt.wantContain != "" && !strings.Contains(got, tt.wantContain) {
				t.Fatalf("expected %q in result\ngot: %q", tt.wantContain, got)
			}
			if tt.wantSuffix != "" && !strings.HasSuffix(got, tt.wantSuffix) {
				t.Fatalf("expected suffix %q\ngot: %q", tt.wantSuffix, got)
			}
			if strings.Contains(got, ";") {
				t.Fatalf("result must not contain semicolons, got: %q", got)
			}
		})
	}
}

func TestQuoteIdentifier(t *testing.T) {
	d := New()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain identifier", in: "users", want: `"users"`},
		{name: "escapes embedded double quote", in: `we"ird`, want: `"we""ird"`},
		{name: "identifier with space", in: "display name", want: `"display name"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := d.QuoteIdentifier(tt.in); got != tt.want {
				t.Fatalf("QuoteIdentifier(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
