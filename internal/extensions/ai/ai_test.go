// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"strings"
	"testing"
)

func TestScrubCodeReplacesLiteralsAndSecrets(t *testing.T) {
	src := "SELECT * FROM t WHERE email = 'a@b.com' AND n = 42; CREATE USER u PASSWORD 'hunter2'; SELECT dblink('host=db user=u password=p');"
	got := ScrubCode(src)
	if strings.Contains(got, "a@b.com") || strings.Contains(got, "hunter2") || strings.Contains(got, "password=p") {
		t.Fatalf("scrub left a secret behind: %s", got)
	}
	if !strings.Contains(got, "'?'") {
		t.Fatalf("expected placeholder, got %s", got)
	}
}

func TestScrubCodeDropsEncryptedDefinition(t *testing.T) {
	src := "CREATE PROCEDURE [dbo].[p] AS /* Definition not available or encrypted */;"
	if ScrubCode(src) != "" {
		t.Fatal("encrypted definition was treated as code")
	}
	if !IsMissingDefinition(src) {
		t.Fatal("expected missing-definition marker")
	}
}

func TestScrubUserInfoURL(t *testing.T) {
	got := ScrubCode("SELECT 'postgres://user:secret@db.example/app'")
	if strings.Contains(got, "secret") || strings.Contains(got, "user:") {
		t.Fatalf("url userinfo remained: %s", got)
	}
}

func TestScanTextHoldsEmailPhoneAndCard(t *testing.T) {
	text := "call me at +1 415 555 0134 or a@b.com card 4111111111111111"
	found := ScanText(text)
	got := map[string]bool{}
	for _, match := range found {
		got[match.Type] = true
		if strings.Contains(match.Sample, "415") || strings.Contains(match.Sample, "a@b.com") {
			t.Fatalf("sample was not masked: %+v", match)
		}
	}
	for _, kind := range []string{"email", "phone", "credit_card"} {
		if !got[kind] {
			t.Fatalf("missing %s in %+v", kind, found)
		}
	}
}

func TestResolveEndpointLocalAndCloud(t *testing.T) {
	local, err := ResolveEndpoint("http://127.0.0.1:11434/v1", Policy{})
	if err != nil {
		t.Fatal(err)
	}
	if !local.Loopback || !strings.HasSuffix(local.URL, "/chat/completions") {
		t.Fatalf("local endpoint: %+v", local)
	}

	if _, err := ResolveEndpoint("http://api.example.com/v1", Policy{AllowCloud: true}); err == nil {
		t.Fatal("plain HTTP to a public host was accepted")
	}
	if _, err := ResolveEndpoint("https://8.8.8.8/v1", Policy{AllowCloud: true, AcceptNewHost: true}); err == nil {
		t.Fatal("raw IP was accepted")
	}
	if _, err := ResolveEndpoint("https://api.example.com/v1", Policy{}); err == nil {
		t.Fatal("cloud was accepted while cloud models are off")
	}
	cloud, err := ResolveEndpoint("https://api.example.com/v1", Policy{AllowCloud: true})
	if !IsHostApproval(err) {
		t.Fatalf("new host should need approval, got %v endpoint %+v", err, cloud)
	}
	accepted, err := ResolveEndpoint("https://api.example.com/v1", Policy{AllowCloud: true, AcceptNewHost: true})
	if err != nil || !accepted.NeedsAllowlistAdd || !strings.HasSuffix(accepted.URL, "/v1/chat/completions") {
		t.Fatalf("accept new host: %v %+v", err, accepted)
	}
	deepseek, err := ResolveEndpoint("https://api.deepseek.com/v1", Policy{AllowCloud: true, AllowedHosts: []string{"api.deepseek.com"}})
	if err != nil || deepseek.Adapter.ID() != AdapterChat || deepseek.URL != "https://api.deepseek.com/v1/chat/completions" {
		t.Fatalf("deepseek endpoint: %v %+v", err, deepseek)
	}
	codex, err := ResolveEndpoint("https://api.openai.com/v1/responses", Policy{AllowCloud: true, AllowedHosts: []string{"api.openai.com"}})
	if err != nil || codex.Adapter.ID() != AdapterResponses || codex.URL != "https://api.openai.com/v1/responses" {
		t.Fatalf("codex endpoint: %v %+v", err, codex)
	}
	if preset, ok := MatchPreset("https://api.openai.com/v1/responses"); !ok || preset.ID != "codex" || preset.ModelsURL != "https://api.openai.com/v1/models" {
		t.Fatalf("codex preset: %v %v", preset, ok)
	}
	if preset, ok := MatchPreset("https://api.deepseek.com/v1"); !ok || preset.ID != "deepseek" {
		t.Fatalf("deepseek preset: %v %v", preset, ok)
	}
	if _, err := ResolveEndpoint("https://api.example.com/v1", Policy{AllowCloud: true, Airgap: true, AcceptNewHost: true}); err == nil {
		t.Fatal("an airgap license accepted a cloud host")
	}
}

func TestSendTokenTracksExactBody(t *testing.T) {
	chat, _ := AdapterByID(AdapterChat)
	body, err := chat.BuildBody(Turn{Model: "local", Metadata: "schema: public", UserText: "count orders"})
	if err != nil {
		t.Fatal(err)
	}
	if Token(body) == Token(body+" ") {
		t.Fatal("token ignored a body change")
	}
	if !strings.Contains(body, "count orders") || !strings.Contains(body, "schema: public") {
		t.Fatalf("body missing pieces: %s", body)
	}
	formatted := FormatMetadata(Catalog{Schema: "public", Notes: []string{"materialized views are not included"}}, false)
	if !strings.Contains(formatted, "<metadata>") || !strings.Contains(formatted, "materialized views") {
		t.Fatalf("metadata block: %s", formatted)
	}
}

func TestExtractSQL(t *testing.T) {
	reply := "Here:\n```sql\nselect id from orders where status = :status\n```\n"
	got := ExtractSQL(reply)
	if !strings.Contains(got, ":status") {
		t.Fatalf("sql: %q", got)
	}
}
