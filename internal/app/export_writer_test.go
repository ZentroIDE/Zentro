// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeAll(t *testing.T, w rowWriter, columns []string, rows [][]string) {
	t.Helper()
	if err := w.WriteHeader(columns); err != nil {
		t.Fatalf("WriteHeader: %v", err)
	}
	for _, row := range rows {
		if err := w.WriteRow(row); err != nil {
			t.Fatalf("WriteRow(%v): %v", row, err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestCSVRowWriter_WritesBOMHeaderAndRows(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out.csv")
	w, err := newCSVRowWriter(path)
	if err != nil {
		t.Fatalf("newCSVRowWriter: %v", err)
	}
	writeAll(t, w, []string{"id", "name"}, [][]string{{"1", "Alice"}, {"2", "Bob, Jr."}})

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if !strings.HasPrefix(string(content), "\xEF\xBB\xBF") {
		t.Fatal("expected a UTF-8 BOM at the start of the file")
	}
	body := strings.TrimPrefix(string(content), "\xEF\xBB\xBF")
	lines := strings.Split(strings.TrimRight(body, "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines (header + 2 rows), got %d: %#v", len(lines), lines)
	}
	if lines[0] != "id,name" {
		t.Fatalf("unexpected header: %q", lines[0])
	}
	if lines[2] != `2,"Bob, Jr."` {
		t.Fatalf("expected the comma in the value to be quoted, got %q", lines[2])
	}
}

func TestJSONRowWriter_ProducesAValidArrayOfObjects(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out.json")
	w, err := newJSONRowWriter(path)
	if err != nil {
		t.Fatalf("newJSONRowWriter: %v", err)
	}
	writeAll(t, w, []string{"id", "active"}, [][]string{{"1", "true"}, {"2", "NULL"}})

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(content, &decoded); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, content)
	}
	if len(decoded) != 2 {
		t.Fatalf("expected 2 objects, got %d", len(decoded))
	}
	if decoded[0]["id"] != "1" {
		t.Fatalf("unexpected first row: %#v", decoded[0])
	}
	if decoded[1]["active"] != nil {
		t.Fatalf("expected the NULL cell to decode as JSON null, got %#v", decoded[1]["active"])
	}
}

func TestJSONRowWriter_EmptyResultIsAnEmptyArray(t *testing.T) {
	path := filepath.Join(t.TempDir(), "empty.json")
	w, err := newJSONRowWriter(path)
	if err != nil {
		t.Fatalf("newJSONRowWriter: %v", err)
	}
	writeAll(t, w, []string{"id"}, nil)

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(content, &decoded); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, content)
	}
	if len(decoded) != 0 {
		t.Fatalf("expected an empty array, got %d entries", len(decoded))
	}
}

func TestSQLInsertRowWriter_WritesOneStatementPerRowAndACountFooter(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out.sql")
	w, err := newSQLInsertRowWriter(path, "users")
	if err != nil {
		t.Fatalf("newSQLInsertRowWriter: %v", err)
	}
	writeAll(t, w, []string{"id", "name"}, [][]string{{"1", "Alice"}, {"2", "O'Brien"}})

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, `INSERT INTO users (id, name) VALUES (1, 'Alice');`) {
		t.Fatalf("missing expected first INSERT, got:\n%s", text)
	}
	if !strings.Contains(text, `VALUES (2, 'O''Brien');`) {
		t.Fatalf("expected the embedded quote to be escaped as '', got:\n%s", text)
	}
	if !strings.Contains(text, "-- Rows: 2\n") {
		t.Fatalf("expected a row-count footer, got:\n%s", text)
	}
}

func TestFormatSQLValue(t *testing.T) {
	cases := map[string]string{
		"":        "NULL",
		"NULL":    "NULL",
		"42":      "42",
		"3.14":    "3.14",
		"hello":   "'hello'",
		"O'Brien": "'O''Brien'",
	}
	for in, want := range cases {
		if got := formatSQLValue(in); got != want {
			t.Errorf("formatSQLValue(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseCellValue(t *testing.T) {
	if v := parseCellValue(""); v != nil {
		t.Errorf("empty string should parse as nil, got %#v", v)
	}
	if v := parseCellValue("NULL"); v != nil {
		t.Errorf(`"NULL" should parse as nil, got %#v`, v)
	}
	if v := parseCellValue("plain text"); v != "plain text" {
		t.Errorf("plain string should pass through unchanged, got %#v", v)
	}
	if v := parseCellValue(`{"a":1}`); v == nil {
		t.Error("JSON-object-shaped text should parse into a map, got nil")
	} else if m, ok := v.(map[string]any); !ok || m["a"] != float64(1) {
		t.Errorf("unexpected parsed object: %#v", v)
	}
}
