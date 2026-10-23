// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func newCursorUserClient() jsonFileMCPClient {
	return jsonFileMCPClient{
		id:            MCPClientCursor,
		removable:     true,
		createMissing: true,
		notFound:      "Cursor was not found on this computer. Open it once, then try again",
		removed:       "Removed from Cursor.",
		added: func() string {
			return "Added to Cursor. Reload MCP in Cursor (Command Palette › MCP) after a change."
		},
		locate: locateCursorUser,
		entry:  cursorHTTPEntry,
	}
}

// CursorUserMCPPath is the user-level mcp.json Cursor reads for every folder.
func CursorUserMCPPath() string {
	loc := locateCursorUser()
	if len(loc.Paths) == 0 {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".cursor", "mcp.json")
	}
	return loc.Paths[0]
}

func locateCursorUser() jsonMCPLocate {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return jsonMCPLocate{}
	}
	dir := filepath.Join(home, ".cursor")
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return jsonMCPLocate{}
	}
	return jsonMCPLocate{Found: true, Paths: []string{filepath.Join(dir, "mcp.json")}}
}

// cursorHTTPEntry is Cursor's native HTTP MCP server. Cursor speaks HTTP
// itself, so this is url + Authorization — not mcp-remote.
func cursorHTTPEntry(url, token string) map[string]json.RawMessage {
	headers, _ := json.Marshal(map[string]string{"Authorization": "Bearer " + token})
	rawURL, _ := json.Marshal(url)
	return map[string]json.RawMessage{
		"url":     rawURL,
		"headers": headers,
	}
}
