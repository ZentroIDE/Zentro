// SPDX-License-Identifier: GPL-3.0-only

package utils

import "testing"

func TestIsInternalSQL(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		{
			name: "schema refresh block comment marker",
			sql:  `SELECT * FROM "app"."orders" /* zentro:schema-rev:0 */`,
			want: true,
		},
		{
			name: "line comment marker",
			sql:  "SELECT 1 -- zentro:internal-probe",
			want: true,
		},
		{
			name: "leading internal marker",
			sql:  "  /* zentro:refresh */ SELECT * FROM users",
			want: true,
		},
		{
			name: "normal user query",
			sql:  "SELECT * FROM orders",
			want: false,
		},
		{
			name: "empty string",
			sql:  "   ",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsInternalSQL(tt.sql); got != tt.want {
				t.Fatalf("IsInternalSQL(%q) = %v, want %v", tt.sql, got, tt.want)
			}
		})
	}
}
