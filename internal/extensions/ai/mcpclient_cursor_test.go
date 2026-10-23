// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCursorHTTPEntryIsMergedAndCreated(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	original := `{"mcpServers":{"other":{"url":"https://example"}}}`
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	client := newCursorUserClient()
	client.locate = func() jsonMCPLocate {
		return jsonMCPLocate{Found: true, Paths: []string{path}}
	}

	result, err := client.Configure(context.Background(), MCPCredentials{
		URL:   "http://127.0.0.1:47391/mcp",
		Token: "tok",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Paths) != 1 || result.Paths[0] != path {
		t.Fatalf("paths %v", result.Paths)
	}

	var got struct {
		MCPServers map[string]struct {
			URL     string            `json:"url"`
			Headers map[string]string `json:"headers"`
			Command string            `json:"command"`
		} `json:"mcpServers"`
	}
	raw, _ := os.ReadFile(path)
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got.MCPServers["other"].URL != "https://example" {
		t.Fatalf("other server was lost: %s", raw)
	}
	zentro := got.MCPServers["zentro"]
	if zentro.URL != "http://127.0.0.1:47391/mcp" || zentro.Headers["Authorization"] != "Bearer tok" {
		t.Fatalf("entry %+v", zentro)
	}
	if zentro.Command != "" {
		t.Fatalf("Cursor must not get an npx command: %s", raw)
	}
	backup, err := os.ReadFile(path + ".bak")
	if err != nil || string(backup) != original {
		t.Fatalf("no backup of the original: %v", err)
	}

	if _, err := client.Remove(context.Background()); err != nil {
		t.Fatal(err)
	}
	raw, _ = os.ReadFile(path)
	if strings.Contains(string(raw), "zentro") || !strings.Contains(string(raw), `"other"`) {
		t.Fatalf("remove did the wrong thing: %s", raw)
	}
}

func TestCursorCreatesMCPJSONWhenTheFolderExists(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp.json")
	client := newCursorUserClient()
	client.locate = func() jsonMCPLocate {
		return jsonMCPLocate{Found: true, Paths: []string{path}}
	}
	if _, err := client.Configure(context.Background(), MCPCredentials{URL: "http://127.0.0.1:1/mcp", Token: "t"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"zentro"`) || !strings.Contains(string(raw), `"url"`) {
		t.Fatalf("entry missing: %s", raw)
	}
	if _, err := os.Stat(path + ".bak"); err == nil {
		t.Fatal("a new file should not get a backup of nothing")
	}
}

func TestCursorConfigureRefusesWhenCursorWasNeverOpened(t *testing.T) {
	client := newCursorUserClient()
	client.locate = func() jsonMCPLocate { return jsonMCPLocate{} }
	_, err := client.Configure(context.Background(), MCPCredentials{URL: "http://127.0.0.1:1/mcp", Token: "t"})
	if err == nil || !strings.Contains(err.Error(), "Cursor was not found") {
		t.Fatalf("got %v", err)
	}
}
