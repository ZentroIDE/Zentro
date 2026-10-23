// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// jsonMCPLocate is the files one JSON-config agent uses on this computer.
type jsonMCPLocate struct {
	Found bool
	Paths []string
}

// jsonFileMCPClient is the shared implementation for agents that keep MCP
// servers in a JSON object (Claude Desktop, Cursor, and later the same shape).
// Only locate and the server entry differ per agent.
type jsonFileMCPClient struct {
	id            string
	removable     bool
	createMissing bool
	notFound      string
	removed       string
	added         func() string
	locate        func() jsonMCPLocate
	entry         func(url, token string) map[string]json.RawMessage
}

func (c jsonFileMCPClient) ID() string { return c.id }

func (c jsonFileMCPClient) Presence() MCPClientPresence {
	loc := c.locate()
	return MCPClientPresence{
		ID:         c.id,
		Found:      loc.Found,
		Configured: jsonMCPConfigured(loc.Paths),
		Removable:  c.removable,
	}
}

func (c jsonFileMCPClient) Configure(_ context.Context, creds MCPCredentials) (MCPClientResult, error) {
	return c.write(creds, false)
}

func (c jsonFileMCPClient) Remove(_ context.Context) (MCPClientResult, error) {
	return c.write(MCPCredentials{}, true)
}

func (c jsonFileMCPClient) write(creds MCPCredentials, remove bool) (MCPClientResult, error) {
	loc := c.locate()
	if !loc.Found || len(loc.Paths) == 0 {
		return MCPClientResult{}, fmt.Errorf("%s", c.notFound)
	}
	var entry map[string]json.RawMessage
	if !remove {
		entry = c.entry(creds.URL, creds.Token)
	}
	for _, path := range loc.Paths {
		if err := writeMCPJSONFileEntry(path, entry, c.createMissing); err != nil {
			return MCPClientResult{Paths: loc.Paths}, err
		}
	}
	message := c.removed
	if !remove && c.added != nil {
		message = c.added()
	}
	return MCPClientResult{Paths: loc.Paths, Message: message}, nil
}

func jsonMCPConfigured(paths []string) bool {
	for _, path := range paths {
		root, err := readJSONObject(path)
		if err != nil {
			continue
		}
		servers, err := jsonObject(root["mcpServers"])
		if err != nil {
			continue
		}
		if _, ok := servers[MCPServerName]; ok {
			return true
		}
	}
	return false
}

// writeMCPJSONFileEntry sets mcpServers.zentro to entry, or removes it when
// entry is nil. Other keys in the file are kept. A .bak is written first when
// the file already exists. createMissing writes a new file when the path is
// absent (Cursor); Claude Desktop never creates a config that was not there.
func writeMCPJSONFileEntry(path string, entry map[string]json.RawMessage, createMissing bool) error {
	root, err := readJSONObject(path)
	if errors.Is(err, os.ErrNotExist) {
		if entry == nil || !createMissing {
			if entry == nil {
				return nil
			}
			return fmt.Errorf("%s was not found", path)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return fmt.Errorf("could not create %s: %w", filepath.Dir(path), err)
		}
		root = map[string]json.RawMessage{}
	} else if err != nil {
		return fmt.Errorf("%s is not valid JSON, so it was left alone: %w", path, err)
	}
	servers, err := jsonObject(root["mcpServers"])
	if err != nil {
		return fmt.Errorf("mcpServers in %s is not an object, so it was left alone", path)
	}
	if entry == nil {
		if _, ok := servers[MCPServerName]; !ok {
			return nil
		}
		delete(servers, MCPServerName)
	} else {
		raw, err := json.Marshal(entry)
		if err != nil {
			return err
		}
		servers[MCPServerName] = raw
	}
	rawServers, err := json.Marshal(servers)
	if err != nil {
		return err
	}
	root["mcpServers"] = rawServers

	if original, err := os.ReadFile(path); err == nil {
		if err := os.WriteFile(path+".bak", original, 0o600); err != nil {
			return fmt.Errorf("could not back up %s: %w", path, err)
		}
	}
	var out bytes.Buffer
	encoded, err := json.Marshal(root)
	if err != nil {
		return err
	}
	if err := json.Indent(&out, encoded, "", "  "); err != nil {
		return err
	}
	out.WriteByte('\n')
	return os.WriteFile(path, out.Bytes(), 0o600)
}

func readJSONObject(path string) (map[string]json.RawMessage, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	return jsonObject(raw)
}

func jsonObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return out, nil
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}
