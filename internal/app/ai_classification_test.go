// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/extensions/ai"
)

func TestCredentialColumnsAreRecognized(t *testing.T) {
	cases := []struct {
		table, column, comment string
		want                   bool
	}{
		{"users", "password", "", true},
		{"users", "password_hash", "", true},
		{"users", "api_key", "", true},
		{"sessions", "refresh_token", "", true},
		{"settings", "Secret", "", true},
		{"users", "pwd", "", true},
		{"users", "memo", "the user's API key", true},
		{"users", "email", "", false},
		{"users", "status", "", false},
		{"orders", "tokens_used", "", false},
		{"users", "id", "", false},
	}
	for _, tc := range cases {
		if got := isCredentialColumn(tc.table, tc.column, tc.comment); got != tc.want {
			t.Fatalf("%s.%s (%q): got %v, want %v", tc.table, tc.column, tc.comment, got, tc.want)
		}
	}
}

func TestMaskedColumnsForTableNamesCredentialsOnly(t *testing.T) {
	cols := []ai.Column{{Name: "password", DataType: "text"}, {Name: "email", DataType: "text"}, {Name: "id", DataType: "int"}}
	masked := maskedColumnsForTable("users", cols)
	if !masked["password"] || masked["email"] || masked["id"] {
		t.Fatalf("masked %v", masked)
	}
}
