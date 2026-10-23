// SPDX-License-Identifier: GPL-3.0-only

package ai

// MCPServerName is the name Zentro's server is registered under in an agent.
const MCPServerName = "zentro"

// MCPClientResult says what connecting one agent did.
type MCPClientResult struct {
	// Paths are the configuration files that were written.
	Paths   []string
	Message string
}
