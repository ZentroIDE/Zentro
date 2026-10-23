// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"strings"
	"testing"
)

func hasMatch(matches []Match, kind string) bool {
	for _, m := range matches {
		if m.Type == kind {
			return true
		}
	}
	return false
}

func TestScanJSONStringsIgnoresNumbersBoolsAndNull(t *testing.T) {
	raw := []byte(`{"estRows":1234567890,"totalBytes":9876543210123,"ok":true,"missing":null}`)
	if matches := ScanJSONStrings(raw); len(matches) != 0 {
		t.Fatalf("a JSON number was flagged as a phone: %+v", matches)
	}
}

func TestScanJSONStringsCatchesAnEmailInAStringValue(t *testing.T) {
	raw := []byte(`{"note":"liên hệ a@b.com"}`)
	matches := ScanJSONStrings(raw)
	if !hasMatch(matches, "email") {
		t.Fatalf("an email in a string value was not caught: %+v", matches)
	}
}

func TestScanJSONStringsCatchesACardNumberInAStringValue(t *testing.T) {
	raw := []byte(`{"sample":"card 4111 1111 1111 1111 on file"}`)
	matches := ScanJSONStrings(raw)
	if !hasMatch(matches, "credit_card") {
		t.Fatalf("a card number in a string value was not caught: %+v", matches)
	}
}

func TestScanJSONStringsCatchesARealPhoneNumberInAStringValue(t *testing.T) {
	raw := []byte(`{"note":"call +1 415-555-0134 for support"}`)
	matches := ScanJSONStrings(raw)
	if !hasMatch(matches, "phone") {
		t.Fatalf("a phone number in a string value was not caught: %+v", matches)
	}
}

func TestScanJSONStringsSkipsKeysEvenWhenTheyLookSensitive(t *testing.T) {
	raw := []byte(`{"password":"short","credential":"x"}`)
	if matches := ScanJSONStrings(raw); len(matches) != 0 {
		t.Fatalf("a sensitive-looking key name was flagged: %+v", matches)
	}
}

func TestScanJSONStringsWalksNestedObjectsAndArrays(t *testing.T) {
	raw := []byte(`{"hits":[{"name":"ok"},{"note":"reach me at a@b.com"}],"meta":{"inner":{"deep":"card 4111111111111111 here"}}}`)
	matches := ScanJSONStrings(raw)
	if !hasMatch(matches, "email") || !hasMatch(matches, "credit_card") {
		t.Fatalf("a nested string value was not reached: %+v", matches)
	}
}

func TestScanJSONStringsOnInvalidJSONReturnsNil(t *testing.T) {
	if matches := ScanJSONStrings([]byte("not json at all")); matches != nil {
		t.Fatalf("invalid JSON should return nil, not scan the raw bytes as text: %+v", matches)
	}
}

func TestScanJSONStringsOnAPlainJSONStringValue(t *testing.T) {
	// A bare JSON string (not wrapped in an object) is a valid json.Unmarshal
	// target too; it must still be scanned, not skipped as "not an object".
	raw := []byte(`"contact a@b.com"`)
	matches := ScanJSONStrings(raw)
	if !hasMatch(matches, "email") {
		t.Fatalf("a top-level JSON string was not scanned: %+v", matches)
	}
}

func TestScanJSONStringsDedupesAcrossMultipleStringValues(t *testing.T) {
	raw := []byte(`{"a":"a@b.com","b":"a@b.com"}`)
	matches := ScanJSONStrings(raw)
	count := 0
	for _, m := range matches {
		if m.Type == "email" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("the same email across two fields was not deduped: %+v", matches)
	}
}

func TestAmountsAndDatesAreNotPhones(t *testing.T) {
	for _, text := range []string{"revenue 4799123.99 this year", "net 1 234 567.5", "noise like 47911.699999 here", "sum 183746.399999", "shipped 2026-10-14", "on 14.10.2026"} {
		if hasMatch(ScanText(text), "phone") {
			t.Fatalf("%q was read as a phone", text)
		}
	}
	for _, text := range []string{"call 0912 345 678 now", "call 091.234.5678", "+1 415-555-0134"} {
		if !hasMatch(ScanText(text), "phone") {
			t.Fatalf("a real phone number was missed: %q", text)
		}
	}
}

func TestScanSourceSaysWhereAndShowsTheText(t *testing.T) {
	matches := ScanSource("the admin is bob@example.com, call him", "your message")
	if len(matches) != 1 || matches[0].Where != "your message" || matches[0].Context != "the admin is bob@example.com, call him" {
		t.Fatalf("matches %+v", matches)
	}
	long := strings.Repeat("x ", 50) + "bob@example.com" + strings.Repeat(" y", 50)
	if got := ScanSource(long, "w")[0].Context; !strings.HasPrefix(got, "…") || !strings.HasSuffix(got, "…") || !strings.Contains(got, "bob@example.com") {
		t.Fatalf("context %q", got)
	}
	if ScanText("bob@example.com")[0].Context != "" {
		t.Fatal("ScanText must not carry context")
	}
}
