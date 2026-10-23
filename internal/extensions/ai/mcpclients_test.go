// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClaudeDesktopEntryIsMergedIntoAnExistingConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude_desktop_config.json")
	original := `{"preferences":{"sidebarMode":"chat"},"mcpServers":{"other":{"command":"x"}}}`
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := writeMCPJSONFileEntry(path, claudeDesktopEntry("http://127.0.0.1:47391/mcp", "tok"), false); err != nil {
		t.Fatal(err)
	}

	var got struct {
		Preferences map[string]string `json:"preferences"`
		MCPServers  map[string]struct {
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
		} `json:"mcpServers"`
	}
	raw, _ := os.ReadFile(path)
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got.Preferences["sidebarMode"] != "chat" || got.MCPServers["other"].Command != "x" {
		t.Fatalf("other settings were lost: %s", raw)
	}
	zentro := got.MCPServers["zentro"]
	if zentro.Command != "npx" || zentro.Env["ZENTRO_AUTH"] != "Bearer tok" {
		t.Fatalf("entry %+v", zentro)
	}
	if !strings.Contains(strings.Join(zentro.Args, " "), "mcp-remote http://127.0.0.1:47391/mcp") ||
		!strings.Contains(strings.Join(zentro.Args, " "), "Authorization:${ZENTRO_AUTH}") {
		t.Fatalf("args %v", zentro.Args)
	}
	if strings.Contains(strings.Join(zentro.Args, " "), "tok") {
		t.Fatal("the token went into the arguments instead of env")
	}
	backup, err := os.ReadFile(path + ".bak")
	if err != nil || string(backup) != original {
		t.Fatalf("no backup of the original: %v", err)
	}

	if err := writeMCPJSONFileEntry(path, nil, false); err != nil {
		t.Fatal(err)
	}
	raw, _ = os.ReadFile(path)
	if strings.Contains(string(raw), "zentro") || !strings.Contains(string(raw), `"other"`) {
		t.Fatalf("remove did the wrong thing: %s", raw)
	}
}

func TestClaudeDesktopEntryWorksOnAnEmptyFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude_desktop_config.json")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeMCPJSONFileEntry(path, claudeDesktopEntry("http://127.0.0.1:1/mcp", "t"), false); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), `"zentro"`) {
		t.Fatalf("entry missing: %s", raw)
	}
}

func TestBrokenClaudeDesktopConfigIsLeftAlone(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude_desktop_config.json")
	broken := `{"preferences": {`
	if err := os.WriteFile(path, []byte(broken), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeMCPJSONFileEntry(path, claudeDesktopEntry("http://127.0.0.1:1/mcp", "t"), false); err == nil {
		t.Fatal("a broken file was overwritten")
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != broken {
		t.Fatalf("a broken file was changed: %s", raw)
	}
}
