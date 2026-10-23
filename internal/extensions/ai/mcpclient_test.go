// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"testing"
)

func TestDefaultMCPClientsListsKnownAgentsWithoutASwitch(t *testing.T) {
	catalog := DefaultMCPClients()
	ids := make([]string, 0)
	for _, p := range catalog.Presence() {
		ids = append(ids, p.ID)
	}
	if len(ids) < 3 || ids[0] != MCPClientClaudeDesktop || ids[1] != MCPClientClaudeCode || ids[2] != MCPClientCursor {
		t.Fatalf("catalog %v", ids)
	}
}

func TestMCPClientsFacadeRejectsUnknownAgents(t *testing.T) {
	_, err := DefaultMCPClients().Configure(context.Background(), "windsurf", MCPCredentials{})
	if err == nil || err.Error() != `unknown agent "windsurf"` {
		t.Fatalf("got %v", err)
	}
}

func TestMCPClientsFacadeRoutesConfigureAndRemove(t *testing.T) {
	fake := &stubMCPClient{id: "stub", removable: true}
	catalog := NewMCPClients(fake)
	if _, err := catalog.Configure(context.Background(), "stub", MCPCredentials{URL: "u", Token: "t"}); err != nil {
		t.Fatal(err)
	}
	if fake.configured != 1 || fake.creds.URL != "u" {
		t.Fatalf("configure not delegated: %+v", fake)
	}
	if _, err := catalog.Remove(context.Background(), "stub"); err != nil {
		t.Fatal(err)
	}
	if fake.removed != 1 {
		t.Fatal("remove not delegated")
	}
}

type stubMCPClient struct {
	id         string
	removable  bool
	configured int
	removed    int
	creds      MCPCredentials
}

func (s *stubMCPClient) ID() string { return s.id }

func (s *stubMCPClient) Presence() MCPClientPresence {
	return MCPClientPresence{ID: s.id, Found: true, Removable: s.removable}
}

func (s *stubMCPClient) Configure(_ context.Context, creds MCPCredentials) (MCPClientResult, error) {
	s.configured++
	s.creds = creds
	return MCPClientResult{Message: "ok"}, nil
}

func (s *stubMCPClient) Remove(context.Context) (MCPClientResult, error) {
	s.removed++
	return MCPClientResult{Message: "gone"}, nil
}
