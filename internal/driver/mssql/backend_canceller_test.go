// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"testing"
)

func TestParseSPID(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		want    int
		wantErr bool
	}{
		{"valid", "62", 62, false},
		{"valid with whitespace", " 62 ", 62, false},
		{"zero", "0", 0, true},
		{"negative", "-3", 0, true},
		{"not a number", "abc", 0, true},
		{"empty", "", 0, true},
		{"sql injection attempt", "62; DROP TABLE users", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSPID(tt.id)
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
				t.Fatalf("parseSPID(%q) = %d, want %d", tt.id, got, tt.want)
			}
		})
	}
}

func TestMSSQLKillStatement(t *testing.T) {
	if got := mssqlKillStatement(62); got != "KILL 62" {
		t.Fatalf("kill statement = %q", got)
	}
}

func TestCancelBackend_SoftCancelIsNoOp(t *testing.T) {
	d := &MSSQLDriver{}
	// force=false must return before ever touching db — nil db would
	// panic otherwise, which is exactly what this guards against.
	if err := d.CancelBackend(context.Background(), nil, "62", false); err != nil {
		t.Fatalf("expected soft cancel to be a no-op, got error: %v", err)
	}
}

func TestCancelBackend_ForceRejectsInvalidIDBeforeTouchingDB(t *testing.T) {
	d := &MSSQLDriver{}
	if err := d.CancelBackend(context.Background(), nil, "not-a-spid", true); err == nil {
		t.Fatal("expected an error for an invalid spid")
	}
}
