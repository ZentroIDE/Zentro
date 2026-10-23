// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var searchSpec = ToolSpec{
	Name:        "search_schema",
	Description: "Find tables by name.",
	Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`),
}

func toolTurn() Turn {
	return Turn{
		Model:    "m",
		Metadata: "instructions",
		UserText: "count orders",
		Stream:   true,
		Tools:    []ToolSpec{searchSpec},
		Steps: []ToolStep{{
			Text:    "Let me look.",
			Calls:   []ToolCall{{ID: "call_1", Name: "search_schema", Arguments: `{"query":"order"}`}},
			Results: []ToolResult{{CallID: "call_1", Name: "search_schema", Content: "table orders"}},
		}},
	}
}

func TestChatBodyOffersToolsAndRepeatsEachRound(t *testing.T) {
	body, err := mustAdapter(t, AdapterChat).BuildBody(toolTurn())
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Tools []struct {
			Type     string `json:"type"`
			Function struct {
				Name string `json:"name"`
			} `json:"function"`
		} `json:"tools"`
		Messages []struct {
			Role       string `json:"role"`
			Content    string `json:"content"`
			ToolCallID string `json:"tool_call_id"`
			ToolCalls  []struct {
				ID       string `json:"id"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Tools) != 1 || parsed.Tools[0].Type != "function" || parsed.Tools[0].Function.Name != "search_schema" {
		t.Fatalf("tools %+v", parsed.Tools)
	}
	roles := []string{}
	for _, message := range parsed.Messages {
		roles = append(roles, message.Role)
	}
	if strings.Join(roles, ",") != "system,user,assistant,tool" {
		t.Fatalf("roles %v", roles)
	}
	call := parsed.Messages[2].ToolCalls[0]
	if call.ID != "call_1" || call.Function.Arguments != `{"query":"order"}` {
		t.Fatalf("call %+v", call)
	}
	if parsed.Messages[3].ToolCallID != "call_1" || parsed.Messages[3].Content != "table orders" {
		t.Fatalf("result %+v", parsed.Messages[3])
	}
}

func TestResponsesBodyCarriesFunctionCallsAndOutputs(t *testing.T) {
	body, err := mustAdapter(t, AdapterResponses).BuildBody(toolTurn())
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`"type":"function_call"`, `"call_id":"call_1"`, `"type":"function_call_output"`,
		`"output":"table orders"`, `"name":"search_schema"`, `"store":false`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %s: %s", want, body)
		}
	}
}

func TestBothAdaptersReadToolCallsFromAWholeReply(t *testing.T) {
	chat, _ := mustAdapter(t, AdapterChat).ParseReply([]byte(`{"choices":[{"message":{"content":null,"tool_calls":[{"id":"c1","type":"function","function":{"name":"describe_table","arguments":"{\"table\":\"orders\"}"}}]}}]}`))
	if len(chat.ToolCalls) != 1 || chat.ToolCalls[0].Name != "describe_table" || chat.ToolCalls[0].ID != "c1" {
		t.Fatalf("chat %+v", chat)
	}
	responses, _ := mustAdapter(t, AdapterResponses).ParseReply([]byte(`{"output":[{"type":"function_call","call_id":"c2","name":"search_schema","arguments":"{\"query\":\"pay\"}"}]}`))
	if len(responses.ToolCalls) != 1 || responses.ToolCalls[0].ID != "c2" || responses.ToolCalls[0].Arguments != `{"query":"pay"}` {
		t.Fatalf("responses %+v", responses)
	}
}

func TestSendJoinsStreamedToolCallPieces(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(
			"data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"function\":{\"name\":\"search_schema\",\"arguments\":\"{\\\"qu\"}}]}}]}\n\n" +
				"data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"ery\\\":\\\"pay\\\"}\"}}]}}]}\n\n" +
				"data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"id\":\"c2\",\"function\":{\"name\":\"describe_table\",\"arguments\":\"{}\"}}]}}]}\n\n" +
				"data: [DONE]\n\n"))
	}))
	defer server.Close()

	result, err := Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "", `{}`, nil)
	if err != nil {
		t.Fatalf("a reply with only tool calls was rejected: %v", err)
	}
	if len(result.ToolCalls) != 2 {
		t.Fatalf("calls %+v", result.ToolCalls)
	}
	if result.ToolCalls[0].ID != "c1" || result.ToolCalls[0].Arguments != `{"query":"pay"}` {
		t.Fatalf("first call %+v", result.ToolCalls[0])
	}
	if result.ToolCalls[1].Name != "describe_table" {
		t.Fatalf("second call %+v", result.ToolCalls[1])
	}
}

func TestSendReadsAFinishedResponsesFunctionCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(
			"data: {\"type\":\"response.function_call_arguments.delta\",\"delta\":\"{\\\"q\"}\n\n" +
				"data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"function_call\",\"call_id\":\"c9\",\"name\":\"search_schema\",\"arguments\":\"{\\\"query\\\":\\\"pay\\\"}\"}}\n\n"))
	}))
	defer server.Close()

	result, err := Send(context.Background(), endpointFor(t, server.URL, AdapterResponses), "", `{}`, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.ToolCalls) != 1 || result.ToolCalls[0].ID != "c9" || result.ToolCalls[0].Arguments != `{"query":"pay"}` {
		t.Fatalf("calls %+v", result.ToolCalls)
	}
}

func TestToolInstructionsNameTheToolsAndForbidRows(t *testing.T) {
	text := ToolInstructions("PostgreSQL", "public")
	for _, want := range []string{"PostgreSQL", "public", "search_schema", "describe_table", "get_definition", "never invent", "<suggestions>"} {
		if !strings.Contains(text, want) {
			t.Fatalf("instructions missing %q", want)
		}
	}
}
