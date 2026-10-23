// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import "testing"

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
