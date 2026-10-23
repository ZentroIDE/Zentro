// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestScanValueToString_ByteSlice_ValidUTF8_PassesThrough(t *testing.T) {
	got := scanValueToString([]byte("hello world"), "")
	if got != "hello world" {
		t.Fatalf("expected raw string passthrough, got %q", got)
	}
}

func TestScanValueToString_ByteSlice_16Bytes_FormatsAsUUID(t *testing.T) {
	b := []byte{
		0x01, 0x02, 0x03, 0x04,
		0x05, 0x06,
		0x07, 0x08,
		0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
	}
	got := scanValueToString(b, "")
	if got != formatSQLServerUUID(b) {
		t.Fatalf("expected UUID formatting for 16-byte value, got %q", got)
	}
}

func TestScanValueToString_ByteSlice_BinaryImage_Base64Encoded(t *testing.T) {
	pngHeader := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x00, 0x00, 0x00, 0x01, 0x00}

	got := scanValueToString(pngHeader, "")

	const prefix = "data:application/octet-stream;base64,"
	if !strings.HasPrefix(got, prefix) {
		t.Fatalf("expected base64 data URI prefix, got %q", got)
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(got, prefix))
	if err != nil {
		t.Fatalf("failed to decode base64 payload: %v", err)
	}
	if string(decoded) != string(pngHeader) {
		t.Fatalf("decoded payload does not match original bytes")
	}
}

// ── Temporal rendering ───────────────────────────────────────────────────────
// Regression guard for the doubled-zone artifact: time.Time.String() emits
// "2026-08-01 14:56:48.055 +0700 +07" (numeric offset AND abbreviation),
// which leaked verbatim into the grid, copy/paste and generated SQL.

func mustLoc(t *testing.T, name string, fallbackOffset int) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("fixed", fallbackOffset)
	}
	return loc
}

func TestFormatTemporalValue_Timestamptz_KeepsSingleNumericOffset(t *testing.T) {
	loc := mustLoc(t, "Asia/Ho_Chi_Minh", 7*3600)
	ts := time.Date(2026, 8, 1, 14, 56, 48, 55*int(time.Millisecond), loc)

	for _, dbType := range []string{"TIMESTAMPTZ", "timestamptz", "timestamp with time zone"} {
		got := scanValueToString(ts, dbType)
		want := "2026-08-01 14:56:48.055 +0700"
		if got != want {
			t.Fatalf("dbType %q: got %q, want %q", dbType, got, want)
		}
		if strings.Contains(got, "+07 ") || strings.HasSuffix(got, "+07") {
			t.Fatalf("dbType %q: zone abbreviation leaked: %q", dbType, got)
		}
	}
}

func TestFormatTemporalValue_PlainTimestamp_HasNoOffset(t *testing.T) {
	// pgx hands back plain `timestamp` values in UTC; the column is not
	// timezone-aware so no offset should be appended.
	ts := time.Date(2026, 8, 1, 14, 56, 48, 55*int(time.Millisecond), time.UTC)
	got := scanValueToString(ts, "TIMESTAMP")
	want := "2026-08-01 14:56:48.055"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestFormatTemporalValue_Date_RendersDateOnly(t *testing.T) {
	ts := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	got := scanValueToString(ts, "DATE")
	if got != "2026-08-01" {
		t.Fatalf("got %q, want %q", got, "2026-08-01")
	}
}

func TestFormatTemporalValue_Time_RendersClockOnly(t *testing.T) {
	ts := time.Date(1, 1, 1, 14, 56, 48, 0, time.UTC)
	got := scanValueToString(ts, "TIME")
	if got != "14:56:48" {
		t.Fatalf("got %q, want %q", got, "14:56:48")
	}
}

func TestFormatTemporalValue_NoDBType_FallsBackToValueZone(t *testing.T) {
	// Non-streaming callers may not thread column metadata; a non-zero
	// offset then means the value carried timezone info.
	loc := time.FixedZone("+07", 7*3600)
	withZone := time.Date(2026, 8, 1, 14, 56, 48, 0, loc)
	if got := scanValueToString(withZone, ""); got != "2026-08-01 14:56:48 +0700" {
		t.Fatalf("with zone: got %q", got)
	}

	utc := time.Date(2026, 8, 1, 14, 56, 48, 0, time.UTC)
	if got := scanValueToString(utc, ""); got != "2026-08-01 14:56:48" {
		t.Fatalf("utc: got %q", got)
	}
}

func TestFormatTemporalValue_TrimsTrailingFractionalZeros(t *testing.T) {
	ts := time.Date(2026, 8, 1, 14, 56, 48, 500*int(time.Millisecond), time.UTC)
	got := scanValueToString(ts, "TIMESTAMP")
	if got != "2026-08-01 14:56:48.5" {
		t.Fatalf("got %q, want %q", got, "2026-08-01 14:56:48.5")
	}
}
