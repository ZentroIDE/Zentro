// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"strings"
	"testing"
)

func TestSplitSuggestionsStripsBlockAndKeepsThree(t *testing.T) {
	clean, items := SplitSuggestions("Answer here.\n<suggestions>[\"a\",\"b\",\"c\",\"d\"]</suggestions>")
	if clean != "Answer here." {
		t.Fatalf("block not removed: %q", clean)
	}
	if len(items) != 3 || items[0] != "a" {
		t.Fatalf("expected first three, got %v", items)
	}
}

func TestSplitSuggestionsDropsBrokenBlock(t *testing.T) {
	clean, items := SplitSuggestions("Answer.\n<suggestions>[oops</suggestions>")
	if clean != "Answer." || items != nil {
		t.Fatalf("got %q %v", clean, items)
	}
}

func TestMetadataBlockLeavesOutInstructions(t *testing.T) {
	metadata := FormatMetadata(Catalog{Schema: "public", Tables: []Table{{Name: "orders"}}}, false)
	block := MetadataBlock(metadata)
	if strings.Contains(block, "SQL assistant") || !strings.Contains(block, "table orders") {
		t.Fatalf("block %q", block)
	}
}

func TestSplitSuggestionsReadsToolCallMarkup(t *testing.T) {
	reply := "Bảng này lưu lịch ca.\n\n" +
		"< | DSML | function_calls>\n< | DSML | invoke name=\"suggestions\">\n" +
		"[\"Lịch ca của một nhân viên\", \"Tìm nhân viên bị phân trùng ca\"]\n" +
		"</ | DSML | invoke>\n</ | DSML | function_calls>"
	for _, bar := range []string{"|", "｜"} {
		text := strings.ReplaceAll(reply, "|", bar)
		clean, items := SplitSuggestions(text)
		if clean != "Bảng này lưu lịch ca." {
			t.Fatalf("markup left in the reply with %q: %q", bar, clean)
		}
		if len(items) != 2 || items[0] != "Lịch ca của một nhân viên" {
			t.Fatalf("items with %q: %v", bar, items)
		}
	}
}

func TestSplitSuggestionsDropsMarkupItCannotRead(t *testing.T) {
	clean, items := SplitSuggestions("Answer.\n<｜DSML｜invoke name=\"other\">{\"x\":1}")
	if clean != "Answer." || items != nil {
		t.Fatalf("got %q %v", clean, items)
	}
	clean, items = SplitSuggestions("Answer.\n<suggestions>[\"one\", \"two\"]")
	if clean != "Answer." || len(items) != 2 {
		t.Fatalf("a tag that never closed: %q %v", clean, items)
	}
}

func TestHasSuggestionMarkup(t *testing.T) {
	for text, want := range map[string]bool{
		"plain":                       false,
		"a < b | c":                   false,
		"x <suggestions>[]":           true,
		"x < | DSML | function_calls": true,
		"x <｜DSML｜invoke":             true,
	} {
		if HasSuggestionMarkup(text) != want {
			t.Fatalf("%q: want %v", text, want)
		}
	}
}

func TestSplitRememberReadsNotesAndKeepsSuggestions(t *testing.T) {
	reply := "Use orders.ship_country.\n" +
		`<remember>["ship_country is the delivery country", "ship_country is the delivery country"]</remember>` + "\n" +
		`<suggestions>["q"]</suggestions>`
	clean, notes := SplitRemember(reply)
	if len(notes) != 1 || notes[0] != "ship_country is the delivery country" {
		t.Fatalf("notes %v", notes)
	}
	if strings.Contains(clean, "remember") || !strings.Contains(clean, "<suggestions>") {
		t.Fatalf("clean %q", clean)
	}
	text, items := SplitSuggestions(clean)
	if text != "Use orders.ship_country." || len(items) != 1 {
		t.Fatalf("suggestions after remember: %q %v", text, items)
	}
}

func TestSplitRememberHandlesPlainTextAndACutTag(t *testing.T) {
	if _, notes := SplitRemember("a <remember>orders join customers on customer_id</remember>"); len(notes) != 1 {
		t.Fatalf("plain text note %v", notes)
	}
	clean, notes := SplitRemember("answer <remember>[\"half")
	if clean != "answer" || len(notes) != 0 {
		t.Fatalf("cut tag: %q %v", clean, notes)
	}
	if clean, notes := SplitRemember("no tags here"); clean != "no tags here" || len(notes) != 0 {
		t.Fatalf("untouched reply: %q %v", clean, notes)
	}
}
