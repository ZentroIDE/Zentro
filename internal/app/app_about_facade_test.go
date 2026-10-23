// SPDX-License-Identifier: GPL-3.0-only

package app

import "testing"

func TestGetAboutInfoPrefersLdflagBuildMetadata(t *testing.T) {
	prevCommit, prevDate := BuildCommit, BuildDate
	t.Cleanup(func() { BuildCommit, BuildDate = prevCommit, prevDate })

	BuildCommit = "  0123456789abcdef0123456789abcdef01234567 "
	BuildDate = "2026-10-07T01:02:03Z"

	info := (&App{}).GetAboutInfo()

	if info.Commit != "0123456789abcdef0123456789abcdef01234567" {
		t.Fatalf("Commit = %q, want the ldflag value trimmed", info.Commit)
	}
	if info.Date != "2026-10-07T01:02:03Z" {
		t.Fatalf("Date = %q, want the ldflag value", info.Date)
	}
}
