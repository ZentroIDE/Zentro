// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"strings"
	"testing"
)

func mustAdapter(t *testing.T, id string) Adapter {
	t.Helper()
	adapter, ok := AdapterByID(id)
	if !ok {
		t.Fatalf("no adapter %q", id)
	}
	return adapter
}

func TestEveryPresetNamesARealAdapter(t *testing.T) {
	for _, preset := range ProviderPresets() {
		adapter, ok := AdapterByID(preset.Adapter)
		if !ok {
			t.Fatalf("preset %s names unknown adapter %q", preset.ID, preset.Adapter)
		}
		endpoint, err := ResolveEndpoint(preset.BaseURL, Policy{
			AllowCloud:   true,
			AllowedHosts: []string{EndpointHost(preset.BaseURL)},
		})
		if err != nil {
			t.Fatal(err)
		}
		if endpoint.Adapter.ID() != adapter.ID() {
			t.Fatalf("preset %s resolves to %s, preset says %s", preset.ID, endpoint.Adapter.ID(), adapter.ID())
		}
		if !strings.HasSuffix(endpoint.URL, adapter.Path()) {
			t.Fatalf("preset %s: URL %s does not end in %s", preset.ID, endpoint.URL, adapter.Path())
		}
	}
	if _, ok := AdapterByID("nope"); ok {
		t.Fatal("an unknown adapter was found")
	}
}

func TestAnAddressTheUserTypedPicksItsAdapterFromThePath(t *testing.T) {
	custom, err := ResolveEndpoint("http://127.0.0.1:11434/v1/responses", Policy{})
	if err != nil || custom.Adapter.ID() != AdapterResponses {
		t.Fatalf("a /responses path: %v %+v", err, custom)
	}
	local, err := ResolveEndpoint("http://127.0.0.1:11434/v1", Policy{})
	if err != nil || local.Adapter.ID() != AdapterChat || !strings.HasSuffix(local.URL, "/v1/chat/completions") {
		t.Fatalf("a plain address: %v %+v", err, local)
	}
}

func TestChatBuildBodyCarriesHistoryAndAsksForUsageWhenStreaming(t *testing.T) {
	body, err := mustAdapter(t, AdapterChat).BuildBody(Turn{
		Model:    "m",
		Metadata: "meta",
		UserText: "now",
		History:  []Message{{Role: "user", Content: "earlier"}, {Role: "assistant", Content: "reply"}},
		Stream:   true,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"earlier"`, `"reply"`, `"stream":true`, `"include_usage":true`} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %s: %s", want, body)
		}
	}
	plain, _ := mustAdapter(t, AdapterChat).BuildBody(Turn{Model: "m", Metadata: "meta", UserText: "now"})
	if strings.Contains(plain, "stream") {
		t.Fatalf("a body that does not stream mentions stream: %s", plain)
	}
}

func TestResponsesBuildBody(t *testing.T) {
	body, err := mustAdapter(t, AdapterResponses).BuildBody(Turn{
		Model:    "gpt-5-codex",
		Metadata: "meta",
		UserText: "count orders",
		History:  []Message{{Role: "user", Content: "earlier"}},
		Stream:   true,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"instructions":"meta"`, `"store":false`, `"stream":true`, `"earlier"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %s: %s", want, body)
		}
	}
	if strings.Contains(body, `"messages"`) || strings.Contains(body, "stream_options") {
		t.Fatalf("a chat-completions field leaked into the responses body: %s", body)
	}
}

func TestBuildBodyNeedsAModelAndAMessage(t *testing.T) {
	for _, id := range []string{AdapterChat, AdapterResponses} {
		adapter := mustAdapter(t, id)
		if _, err := adapter.BuildBody(Turn{UserText: "x"}); err == nil {
			t.Fatalf("%s accepted a turn with no model", id)
		}
		if _, err := adapter.BuildBody(Turn{Model: "m"}); err == nil {
			t.Fatalf("%s accepted a turn with no message", id)
		}
	}
}

func TestChatParsesDeepSeekAndOpenAIReplies(t *testing.T) {
	chat := mustAdapter(t, AdapterChat)

	deepseek, ok := chat.ParseReply([]byte(`{"choices":[{"message":{"content":" hi "}}],"usage":{"prompt_tokens":120,"completion_tokens":30,"prompt_cache_hit_tokens":100}}`))
	if !ok || deepseek.Text != "hi" || deepseek.Usage != (Usage{Input: 120, Output: 30, Cached: 100}) {
		t.Fatalf("deepseek reply %+v %v", deepseek, ok)
	}
	openai, ok := chat.ParseReply([]byte(`{"choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":50,"completion_tokens":9,"prompt_tokens_details":{"cached_tokens":40}}}`))
	if !ok || openai.Usage != (Usage{Input: 50, Output: 9, Cached: 40}) {
		t.Fatalf("openai reply %+v %v", openai, ok)
	}
	failed, ok := chat.ParseReply([]byte(`{"error":{"message":"model not found"}}`))
	if !ok || failed.APIMessage != "model not found" || failed.Text != "" {
		t.Fatalf("error reply %+v %v", failed, ok)
	}
	if _, ok := chat.ParseReply([]byte(`not json`)); ok {
		t.Fatal("a body that is not JSON was understood")
	}
}

func TestChatParsesStreamEvents(t *testing.T) {
	chat := mustAdapter(t, AdapterChat)
	if event := chat.ParseStreamEvent(`{"choices":[{"delta":{"content":"Hel"}}]}`); event.Delta != "Hel" {
		t.Fatalf("delta %+v", event)
	}
	if event := chat.ParseStreamEvent(`{"choices":[{"delta":{"reasoning_content":"thinking"}}]}`); event.Reasoning != "thinking" || event.Delta != "" {
		t.Fatalf("reasoning %+v", event)
	}
	if event := chat.ParseStreamEvent(`{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}`); event.Usage != (Usage{Input: 10, Output: 2}) {
		t.Fatalf("usage %+v", event)
	}
	if event := chat.ParseStreamEvent(`{"error":{"message":"overloaded"}}`); event.Err != "overloaded" {
		t.Fatalf("error %+v", event)
	}
	if event := chat.ParseStreamEvent(`not json`); event.Delta != "" || event.Err != "" || len(event.ToolCalls) != 0 {
		t.Fatalf("junk %+v", event)
	}
}

func TestResponsesParsesRepliesAndStreamEvents(t *testing.T) {
	responses := mustAdapter(t, AdapterResponses)

	reply, ok := responses.ParseReply([]byte(`{"output":[{"content":[{"type":"output_text","text":"select 1"}]}],"usage":{"input_tokens":50,"output_tokens":9,"input_tokens_details":{"cached_tokens":40}}}`))
	if !ok || reply.Text != "select 1" || reply.Usage != (Usage{Input: 50, Output: 9, Cached: 40}) {
		t.Fatalf("reply %+v %v", reply, ok)
	}
	refusal, _ := responses.ParseReply([]byte(`{"output":[{"content":[{"refusal":"I cannot help with that"}]}]}`))
	if refusal.Text != "I cannot help with that" {
		t.Fatalf("refusal %+v", refusal)
	}

	if event := responses.ParseStreamEvent(`{"type":"response.output_text.delta","delta":"sel"}`); event.Delta != "sel" {
		t.Fatalf("delta %+v", event)
	}
	if event := responses.ParseStreamEvent(`{"type":"response.completed","response":{"usage":{"input_tokens":7,"output_tokens":3}}}`); event.Usage != (Usage{Input: 7, Output: 3}) {
		t.Fatalf("completed %+v", event)
	}
	if event := responses.ParseStreamEvent(`{"type":"error","message":"rate limited"}`); event.Err != "rate limited" {
		t.Fatalf("error %+v", event)
	}
	if event := responses.ParseStreamEvent(`{"type":"response.created","response":{}}`); event.Delta != "" || event.Err != "" {
		t.Fatalf("an event it does not use produced output: %+v", event)
	}
}
