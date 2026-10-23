// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"fmt"
)

// IDs Settings and ConnectMCPClient use. A new agent is a new MCPClient in
// DefaultMCPClients — these strings stay the public names.
const (
	MCPClientClaudeDesktop = "claude-desktop"
	MCPClientClaudeCode    = "claude-code"
	MCPClientCursor        = "cursor"
)

// MCPCredentials are what every agent needs to reach Zentro's MCP server.
type MCPCredentials struct {
	URL   string
	Token string
}

// MCPClientPresence is what Settings shows for one agent on this computer.
type MCPClientPresence struct {
	ID         string `json:"id"`
	Found      bool   `json:"found"`
	Configured bool   `json:"configured"`
	Removable  bool   `json:"removable"`
}

// MCPClient writes Zentro into one agent's configuration. Each agent is its
// own type; the catalog below is the only place that lists them.
type MCPClient interface {
	ID() string
	Presence() MCPClientPresence
	Configure(ctx context.Context, creds MCPCredentials) (MCPClientResult, error)
	Remove(ctx context.Context) (MCPClientResult, error)
}

// MCPClients is the facade Settings and the AI service talk to. Adding Cursor,
// Windsurf, or another IDE is a new MCPClient registered here — Connect and
// Disconnect do not grow a switch.
type MCPClients struct {
	clients []MCPClient
}

// NewMCPClients builds a catalog. Tests pass fakes; production uses DefaultMCPClients.
func NewMCPClients(clients ...MCPClient) MCPClients {
	out := make([]MCPClient, 0, len(clients))
	for _, client := range clients {
		if client != nil {
			out = append(out, client)
		}
	}
	return MCPClients{clients: out}
}

// DefaultMCPClients is the agents Zentro can set up from Settings.
func DefaultMCPClients() MCPClients {
	return NewMCPClients(
		newClaudeDesktopClient(),
		newClaudeCodeClient(),
		newCursorUserClient(),
	)
}

// Lookup finds one agent by the id ConnectMCPClient receives.
func (c MCPClients) Lookup(id string) (MCPClient, error) {
	for _, client := range c.clients {
		if client.ID() == id {
			return client, nil
		}
	}
	return nil, fmt.Errorf("unknown agent %q", id)
}

// Presence reports every registered agent, in catalog order.
func (c MCPClients) Presence() []MCPClientPresence {
	out := make([]MCPClientPresence, 0, len(c.clients))
	for _, client := range c.clients {
		out = append(out, client.Presence())
	}
	return out
}

// Configure writes Zentro into the named agent.
func (c MCPClients) Configure(ctx context.Context, id string, creds MCPCredentials) (MCPClientResult, error) {
	client, err := c.Lookup(id)
	if err != nil {
		return MCPClientResult{}, err
	}
	return client.Configure(ctx, creds)
}

// Remove takes Zentro out of the named agent, when that agent stores a file
// Zentro is allowed to edit. CLI-only agents tell the user the command instead.
func (c MCPClients) Remove(ctx context.Context, id string) (MCPClientResult, error) {
	client, err := c.Lookup(id)
	if err != nil {
		return MCPClientResult{}, err
	}
	if !client.Presence().Removable {
		return MCPClientResult{}, fmt.Errorf("remove it in the agent: claude mcp remove %s --scope user", MCPServerName)
	}
	return client.Remove(ctx)
}
