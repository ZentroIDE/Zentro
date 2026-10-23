// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"os/exec"

	"zentro/internal/extensions/ai"
)

// AIMCPClientResult says what connecting an agent did, for Settings to show.
type AIMCPClientResult struct {
	Message string   `json:"message"`
	Paths   []string `json:"paths"`
}

// aiMCPSettings is the MCP part of the settings file. It is not per project:
// the server serves whichever project is open.
type aiMCPSettings struct {
	AutoStart bool `json:"autoStart"`
}

func (s *AIService) mcpClientCatalog() ai.MCPClients {
	return ai.DefaultMCPClients()
}

// ConnectMCPClient writes Zentro into an agent's configuration. The server must
// be running, so the address and token written are the ones it answers on.
func (s *AIService) ConnectMCPClient(ctx context.Context, client string) (AIMCPClientResult, error) {
	status := s.MCPStatus()
	if !status.Running {
		return AIMCPClientResult{}, fmt.Errorf("start the MCP server first")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	result, err := s.mcpClientCatalog().Configure(ctx, client, ai.MCPCredentials{
		URL:   status.URL,
		Token: status.Token,
	})
	if err != nil {
		return AIMCPClientResult{}, err
	}
	if s.logger != nil {
		s.logger.Info("mcp client configured", "client", client, "files", len(result.Paths))
	}
	return AIMCPClientResult{Message: result.Message, Paths: append([]string{}, result.Paths...)}, nil
}

// DisconnectMCPClient takes Zentro out of an agent that stores a file Zentro
// can edit (Claude Desktop, Cursor). Claude Code keeps its own list.
func (s *AIService) DisconnectMCPClient(client string) (AIMCPClientResult, error) {
	result, err := s.mcpClientCatalog().Remove(context.Background(), client)
	if err != nil {
		return AIMCPClientResult{}, err
	}
	return AIMCPClientResult{Message: result.Message, Paths: append([]string{}, result.Paths...)}, nil
}

// RotateMCPToken replaces the token. Agents set up with the old one stop
// working until they are connected again.
func (s *AIService) RotateMCPToken() (AIMCPStatus, error) {
	if s.mcpTokenFn == nil {
		if err := ai.DeleteProviderKey(aiMCPKeyProject, aiMCPKeyHost); err != nil {
			return AIMCPStatus{}, fmt.Errorf("the old MCP token could not be removed from the OS keyring")
		}
	}
	token, err := s.mcpToken()
	if err != nil {
		return AIMCPStatus{}, err
	}
	s.mcp.mu.Lock()
	if s.mcp.server != nil {
		s.mcp.token = token
	}
	s.mcp.mu.Unlock()
	if s.logger != nil {
		s.logger.Info("mcp token rotated")
	}
	return s.MCPStatus(), nil
}

// SetMCPAutoStart remembers whether the server starts with Zentro.
func (s *AIService) SetMCPAutoStart(on bool) (AIMCPStatus, error) {
	file, path, err := s.loadFile()
	if err != nil {
		return AIMCPStatus{}, err
	}
	file.MCP.AutoStart = on
	if err := saveAISettings(path, file); err != nil {
		return AIMCPStatus{}, err
	}
	return s.MCPStatus(), nil
}

// AutoStartMCP starts the server when the user asked for it to start with
// Zentro. A failure is logged and shown in Settings, never raised at startup.
func (s *AIService) AutoStartMCP() {
	file, _, err := s.loadFile()
	if err != nil || !file.MCP.AutoStart {
		return
	}
	if _, err := s.StartMCPServer(); err != nil && s.logger != nil {
		s.logger.Warn("mcp server did not start with zentro", "err", err)
	}
}

// mcpClientStatus fills in what is installed and configured on this computer.
func (s *AIService) mcpClientStatus(status *AIMCPStatus) {
	if file, _, err := s.loadFile(); err == nil {
		status.AutoStart = file.MCP.AutoStart
	}
	_, npxErr := exec.LookPath("npx")
	status.NodeFound = npxErr == nil
	for _, presence := range s.mcpClientCatalog().Presence() {
		status.Clients = append(status.Clients, AIMCPClientPresence{
			ID:         presence.ID,
			Found:      presence.Found,
			Configured: presence.Configured,
			Removable:  presence.Removable,
		})
		switch presence.ID {
		case ai.MCPClientClaudeDesktop:
			status.ClaudeDesktopFound = presence.Found
			status.ClaudeDesktopConfigured = presence.Configured
		case ai.MCPClientClaudeCode:
			status.ClaudeCodeFound = presence.Found
		}
	}
}
