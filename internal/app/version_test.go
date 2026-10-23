// SPDX-License-Identifier: GPL-3.0-only

package app

import "testing"

func TestVersionFromWailsJSON(t *testing.T) {
	cases := map[string]string{
		`{"info":{"productVersion":"0.8.0"}}`:   "v0.8.0",
		`{"info":{"productVersion":"0.8.0.0"}}`: "v0.8.0",
		`{"info":{"productVersion":"v1.2.3"}}`:  "v1.2.3",
		`{"info":{}}`:                           "v0.0.0",
		`not json`:                              "v0.0.0",
	}
	for in, want := range cases {
		if got := versionFromWailsJSON([]byte(in)); got != want {
			t.Errorf("versionFromWailsJSON(%s) = %q, want %q", in, got, want)
		}
	}
}

func TestApplyWailsProductVersionKeepsLdflagsValue(t *testing.T) {
	prev := Version
	t.Cleanup(func() { Version = prev })

	Version = "v9.9.9-rc.1"
	ApplyWailsProductVersion([]byte(`{"info":{"productVersion":"0.8.0"}}`))
	if Version != "v9.9.9-rc.1" {
		t.Fatalf("Version = %q, ldflags value must not be overwritten", Version)
	}

	Version = ""
	ApplyWailsProductVersion([]byte(`{"info":{"productVersion":"0.8.0"}}`))
	if Version != "v0.8.0" {
		t.Fatalf("Version = %q, want v0.8.0", Version)
	}
}
