// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
)

func newClaudeDesktopClient() jsonFileMCPClient {
	return jsonFileMCPClient{
		id:            MCPClientClaudeDesktop,
		removable:     true,
		createMissing: false,
		notFound:      "Claude Desktop was not found on this computer. Open it once, then try again",
		removed:       "Removed from Claude Desktop.",
		added: func() string {
			message := "Added to Claude Desktop. Quit Claude Desktop from the tray and open it again."
			if _, err := exec.LookPath("npx"); err != nil {
				message += " It needs Node.js, which was not found: install it from nodejs.org first."
			}
			return message
		},
		locate: locateClaudeDesktop,
		entry:  claudeDesktopEntry,
	}
}

// ClaudeDesktopConfigPaths returns the Claude Desktop configuration files that
// exist on this computer. On Windows the Microsoft Store build keeps its own
// copy under the package folder, so both places are checked.
func ClaudeDesktopConfigPaths() []string {
	return locateClaudeDesktop().Paths
}

func locateClaudeDesktop() jsonMCPLocate {
	var candidates []string
	home, _ := os.UserHomeDir()
	switch goruntime.GOOS {
	case "windows":
		if appData := os.Getenv("APPDATA"); appData != "" {
			candidates = append(candidates, filepath.Join(appData, "Claude", "claude_desktop_config.json"))
		}
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			matches, _ := filepath.Glob(filepath.Join(local, "Packages", "Claude_*", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"))
			candidates = append(candidates, matches...)
		}
	case "darwin":
		candidates = append(candidates, filepath.Join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"))
	default:
		candidates = append(candidates, filepath.Join(home, ".config", "Claude", "claude_desktop_config.json"))
	}
	var found []string
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			found = append(found, path)
		}
	}
	return jsonMCPLocate{Found: len(found) > 0, Paths: found}
}

// claudeDesktopEntry is the server entry Claude Desktop runs. Claude Desktop
// only starts local servers as commands, so mcp-remote bridges its stdio to
// Zentro's HTTP server. The token is passed through env and the header has no
// space after the colon, which keeps Windows from splitting the argument.
func claudeDesktopEntry(url, token string) map[string]json.RawMessage {
	args, _ := json.Marshal([]string{
		"-y", "mcp-remote", url,
		"--allow-http",
		"--transport", "http-only",
		"--header", "Authorization:${ZENTRO_AUTH}",
	})
	env, _ := json.Marshal(map[string]string{"ZENTRO_AUTH": "Bearer " + token})
	return map[string]json.RawMessage{
		"command": json.RawMessage(`"npx"`),
		"args":    args,
		"env":     env,
	}
}

// ConfigureClaudeDesktop adds or replaces the Zentro entry in every Claude
// Desktop configuration found.
func ConfigureClaudeDesktop(url, token string) (MCPClientResult, error) {
	return newClaudeDesktopClient().Configure(context.Background(), MCPCredentials{URL: url, Token: token})
}

// RemoveFromClaudeDesktop takes the Zentro entry out of every configuration.
func RemoveFromClaudeDesktop() (MCPClientResult, error) {
	return newClaudeDesktopClient().Remove(context.Background())
}

// ClaudeDesktopConfigured reports whether a configuration already names Zentro.
func ClaudeDesktopConfigured() bool {
	return newClaudeDesktopClient().Presence().Configured
}
