// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type claudeCodeClient struct {
	lookPath func(file string) (string, error)
	run      func(ctx context.Context, name string, args ...string) ([]byte, error)
}

func newClaudeCodeClient() claudeCodeClient {
	return claudeCodeClient{
		lookPath: exec.LookPath,
		run: func(ctx context.Context, name string, args ...string) ([]byte, error) {
			cmd := exec.CommandContext(ctx, name, args...)
			return cmd.CombinedOutput()
		},
	}
}

func (c claudeCodeClient) ID() string { return MCPClientClaudeCode }

func (c claudeCodeClient) Presence() MCPClientPresence {
	_, err := c.lookPath("claude")
	return MCPClientPresence{ID: c.ID(), Found: err == nil, Configured: false, Removable: false}
}

func (c claudeCodeClient) Configure(ctx context.Context, creds MCPCredentials) (MCPClientResult, error) {
	claude, err := c.lookPath("claude")
	if err != nil {
		return MCPClientResult{}, fmt.Errorf("the claude command was not found. Install Claude Code, or copy the command from Manual setup")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	// An older entry with another token would make add fail, so remove it first.
	_, _ = c.run(ctx, claude, "mcp", "remove", MCPServerName, "--scope", "user")
	output, err := c.run(ctx, claude, "mcp", "add", "--scope", "user", "--transport", "http",
		MCPServerName, creds.URL, "--header", "Authorization: Bearer "+creds.Token)
	if err != nil {
		text := strings.ReplaceAll(strings.TrimSpace(string(output)), creds.Token, "[token]")
		return MCPClientResult{}, fmt.Errorf("claude mcp add failed: %s", text)
	}
	return MCPClientResult{Message: "Added to Claude Code for every folder. Run /mcp in Claude Code to check."}, nil
}

func (c claudeCodeClient) Remove(context.Context) (MCPClientResult, error) {
	return MCPClientResult{}, fmt.Errorf("remove it in the agent: claude mcp remove %s --scope user", MCPServerName)
}

// ConfigureClaudeCode registers Zentro with the Claude Code CLI for every
// folder (user scope), replacing an older entry. It needs the claude command.
func ConfigureClaudeCode(ctx context.Context, url, token string) (MCPClientResult, error) {
	return newClaudeCodeClient().Configure(ctx, MCPCredentials{URL: url, Token: token})
}
