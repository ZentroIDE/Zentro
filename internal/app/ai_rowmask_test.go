// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"
)

func TestSerializeCellMasksCredentialsAndClips(t *testing.T) {
	if got := serializeCell("secret-value", true); got != "***" {
		t.Fatalf("sensitive: %q", got)
	}
	if got := serializeCell([]byte{0x00, 0x01, 0xff}, false); got != "<bytea 3 B>" {
		t.Fatalf("binary: %q", got)
	}
	big := make([]byte, 2300)
	if got := serializeCell(big, false); got != "<bytea 2.2 KB>" {
		t.Fatalf("binary size: %q", got)
	}
	long := strings.Repeat("a", 2000)
	if got := serializeCell(long, false); len(got) != aiCellMaxBytes {
		t.Fatalf("clip length %d", len(got))
	}
	if got := serializeCell(nil, false); got != "" {
		t.Fatalf("null: %q", got)
	}
}

func TestSerializeCellHidesShapesButNotNumbers(t *testing.T) {
	if got := serializeCell("bob@example.com", false); got != "***" {
		t.Fatalf("email cell %q", got)
	}
	if got := serializeCell("shipped", false); got != "shipped" {
		t.Fatalf("plain text %q", got)
	}
	if got := serializeCell(int64(84912345678), false); got != "84912345678" {
		t.Fatalf("a number was hidden: %q", got)
	}
}
