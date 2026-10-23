// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"testing"
)

func TestParseConnectionID(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		want    int64
		wantErr bool
	}{
		{"valid", "4471", 4471, false},
		{"valid with whitespace", " 4471 ", 4471, false},
		{"zero", "0", 0, true},
		{"negative", "-1", 0, true},
		{"not a number", "abc", 0, true},
		{"empty", "", 0, true},
		{"sql injection attempt", "1; DROP TABLE users", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseConnectionID(tt.id)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for id %q, got nil", tt.id)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("parseConnectionID(%q) = %d, want %d", tt.id, got, tt.want)
			}
		})
	}
}

func TestMySQLKillStatement(t *testing.T) {
	if got := mysqlKillStatement(4471, false); got != "KILL QUERY 4471" {
		t.Fatalf("soft cancel statement = %q", got)
	}
	if got := mysqlKillStatement(4471, true); got != "KILL 4471" {
		t.Fatalf("force kill statement = %q", got)
	}
}

func TestCancelBackend_RejectsInvalidIDBeforeTouchingDB(t *testing.T) {
	d := New()
	if err := d.CancelBackend(context.Background(), nil, "not-an-id", false); err == nil {
		t.Fatal("expected an error for an invalid connection id")
	}
}
