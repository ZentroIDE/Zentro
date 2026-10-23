// SPDX-License-Identifier: GPL-3.0-only

package main

import "testing"

func TestParseLaunchProjectFlag(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want string
	}{
		{"no args", nil, ""},
		{"no project flag", []string{"--foo=bar"}, ""},
		{"project flag", []string{"--project=abc-123"}, "abc-123"},
		{"project flag among others", []string{"--verbose", "--project=xyz", "--foo"}, "xyz"},
		{"empty value", []string{"--project="}, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseLaunchProjectFlag(tc.args); got != tc.want {
				t.Fatalf("parseLaunchProjectFlag(%v) = %q, want %q", tc.args, got, tc.want)
			}
		})
	}
}
