// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"testing"
)

func TestParseBackendPID(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		want    int
		wantErr bool
	}{
		{"valid", "18302", 18302, false},
		{"valid with whitespace", "  18302 ", 18302, false},
		{"zero", "0", 0, true},
		{"negative", "-5", 0, true},
		{"not a number", "abc", 0, true},
		{"empty", "", 0, true},
		{"sql injection attempt", "18302; DROP TABLE users", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseBackendPID(tt.id)
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
				t.Fatalf("parseBackendPID(%q) = %d, want %d", tt.id, got, tt.want)
			}
		})
	}
}

func TestPgCancelBackendQuery(t *testing.T) {
	if got := pgCancelBackendQuery(false); got != "SELECT pg_cancel_backend($1)" {
		t.Fatalf("soft cancel query = %q", got)
	}
	if got := pgCancelBackendQuery(true); got != "SELECT pg_terminate_backend($1)" {
		t.Fatalf("force kill query = %q", got)
	}
}

func TestCancelBackend_RejectsInvalidIDBeforeTouchingDB(t *testing.T) {
	d := New()
	// db is nil: if CancelBackend touched it before validating id, this
	// would panic instead of returning a validation error.
	if err := d.CancelBackend(context.Background(), nil, "not-a-pid", false); err == nil {
		t.Fatal("expected an error for an invalid backend id")
	}
}
