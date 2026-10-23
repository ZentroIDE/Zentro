// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"strings"
)

// chatAdapter speaks the OpenAI chat-completions API. Hosts that copy it add
// fields of their own. The ones Zentro reads are named below, in one place.
type chatAdapter struct{}

func (chatAdapter) ID() string   { return AdapterChat }
func (chatAdapter) Path() string { return "/chat/completions" }

type chatMessage struct {
	Role       string         `json:"role"`
	Content    string         `json:"content"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

type chatToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function chatToolFunction `json:"function"`
}

type chatToolFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type chatTool struct {
	Type     string             `json:"type"`
	Function chatToolDefinition `json:"function"`
}

type chatToolDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type chatStreamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type chatRequest struct {
	Model         string             `json:"model"`
	Messages      []chatMessage      `json:"messages"`
	Tools         []chatTool         `json:"tools,omitempty"`
	Stream        bool               `json:"stream,omitempty"`
	StreamOptions *chatStreamOptions `json:"stream_options,omitempty"`
}

func (chatAdapter) BuildBody(turn Turn) (string, error) {
	if err := validateTurn(turn); err != nil {
		return "", err
	}
	messages := make([]chatMessage, 0, len(turn.History)+2)
	messages = append(messages, chatMessage{Role: "system", Content: turn.Metadata})
	for _, item := range turn.History {
		messages = append(messages, chatMessage{Role: item.Role, Content: item.Content})
	}
	messages = append(messages, chatMessage{Role: "user", Content: turn.UserText})
	// Each tool round is the assistant's call followed by one tool message per result.
	for _, step := range turn.Steps {
		calls := make([]chatToolCall, 0, len(step.Calls))
		for _, call := range step.Calls {
			calls = append(calls, chatToolCall{
				ID:       call.ID,
				Type:     "function",
				Function: chatToolFunction{Name: call.Name, Arguments: call.Arguments},
			})
		}
		messages = append(messages, chatMessage{Role: "assistant", Content: step.Text, ToolCalls: calls})
		for _, result := range step.Results {
			messages = append(messages, chatMessage{Role: "tool", ToolCallID: result.CallID, Content: result.Content})
		}
	}
	request := chatRequest{Model: turn.Model, Messages: messages}
	for _, tool := range turn.Tools {
		request.Tools = append(request.Tools, chatTool{
			Type:     "function",
			Function: chatToolDefinition{Name: tool.Name, Description: tool.Description, Parameters: tool.Parameters},
		})
	}
	if turn.Stream {
		request.Stream = true
		// Without this a streamed reply carries no token counts.
		request.StreamOptions = &chatStreamOptions{IncludeUsage: true}
	}
	raw, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// chatUsage reads the token counts of chat completions. The cached part of the
// prompt is reported under a different name by each host.
type chatUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	// DeepSeek.
	PromptCacheHit int `json:"prompt_cache_hit_tokens"`
	// OpenAI and compatible hosts.
	PromptDetails *struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
}

func (u *chatUsage) usage() Usage {
	if u == nil {
		return Usage{}
	}
	out := Usage{Input: u.PromptTokens, Output: u.CompletionTokens, Cached: u.PromptCacheHit}
	if u.PromptDetails != nil {
		out.Cached = max(out.Cached, u.PromptDetails.CachedTokens)
	}
	return out
}

func (chatAdapter) UsableModels(ids []string) []string { return openAIChatModels(ids) }

func (chatAdapter) ParseReply(raw []byte) (Reply, bool) {
	if !json.Valid(raw) {
		return Reply{}, false
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content   string         `json:"content"`
				ToolCalls []chatToolCall `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
		Usage *chatUsage `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Reply{}, false
	}
	reply := Reply{Usage: parsed.Usage.usage()}
	if parsed.Error != nil {
		reply.APIMessage = parsed.Error.Message
	}
	if len(parsed.Choices) > 0 {
		message := parsed.Choices[0].Message
		reply.Text = strings.TrimSpace(message.Content)
		for _, call := range message.ToolCalls {
			reply.ToolCalls = append(reply.ToolCalls, ToolCall{
				ID:        call.ID,
				Name:      call.Function.Name,
				Arguments: call.Function.Arguments,
			})
		}
	}
	return reply, true
}

func (chatAdapter) ParseStreamEvent(data string) StreamEvent {
	var event struct {
		Choices []struct {
			Delta struct {
				Content string `json:"content"`
				// DeepSeek and other reasoning models send their thinking here.
				ReasoningContent string `json:"reasoning_content"`
				ToolCalls        []struct {
					Index    int    `json:"index"`
					ID       string `json:"id"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"delta"`
		} `json:"choices"`
		Usage *chatUsage `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(data), &event); err != nil {
		return StreamEvent{}
	}
	if event.Error != nil {
		return StreamEvent{Err: event.Error.Message}
	}
	out := StreamEvent{Usage: event.Usage.usage()}
	if len(event.Choices) > 0 {
		delta := event.Choices[0].Delta
		out.Delta = delta.Content
		out.Reasoning = delta.ReasoningContent
		for _, call := range delta.ToolCalls {
			out.ToolCalls = append(out.ToolCalls, ToolCallDelta{
				Index:     call.Index,
				ID:        call.ID,
				Name:      call.Function.Name,
				Arguments: call.Function.Arguments,
			})
		}
	}
	return out
}
