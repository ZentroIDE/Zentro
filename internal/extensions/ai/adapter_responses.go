// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"strings"
)

// responsesAdapter speaks the OpenAI responses API that Codex models use.
type responsesAdapter struct{}

func (responsesAdapter) ID() string   { return AdapterResponses }
func (responsesAdapter) Path() string { return "/responses" }

type responsesItem struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// The responses API takes a tool round as two kinds of input item.
type responsesFunctionCall struct {
	Type      string `json:"type"`
	CallID    string `json:"call_id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type responsesFunctionOutput struct {
	Type   string `json:"type"`
	CallID string `json:"call_id"`
	Output string `json:"output"`
}

type responsesTool struct {
	Type        string          `json:"type"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type responsesRequest struct {
	Model        string          `json:"model"`
	Instructions string          `json:"instructions"`
	Input        []any           `json:"input"`
	Tools        []responsesTool `json:"tools,omitempty"`
	// Store false asks the host not to keep the conversation.
	Store  bool `json:"store"`
	Stream bool `json:"stream,omitempty"`
}

func (responsesAdapter) BuildBody(turn Turn) (string, error) {
	if err := validateTurn(turn); err != nil {
		return "", err
	}
	input := make([]any, 0, len(turn.History)+1)
	for _, item := range turn.History {
		input = append(input, responsesItem{Role: item.Role, Content: item.Content})
	}
	input = append(input, responsesItem{Role: "user", Content: turn.UserText})
	// Store is false, so the host keeps nothing: every round is sent again.
	for _, step := range turn.Steps {
		if strings.TrimSpace(step.Text) != "" {
			input = append(input, responsesItem{Role: "assistant", Content: step.Text})
		}
		for _, call := range step.Calls {
			input = append(input, responsesFunctionCall{Type: "function_call", CallID: call.ID, Name: call.Name, Arguments: call.Arguments})
		}
		for _, result := range step.Results {
			input = append(input, responsesFunctionOutput{Type: "function_call_output", CallID: result.CallID, Output: result.Content})
		}
	}
	request := responsesRequest{
		Model:        turn.Model,
		Instructions: turn.Metadata,
		Input:        input,
		Store:        false,
		Stream:       turn.Stream,
	}
	for _, tool := range turn.Tools {
		request.Tools = append(request.Tools, responsesTool{Type: "function", Name: tool.Name, Description: tool.Description, Parameters: tool.Parameters})
	}
	raw, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

type responsesUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	InputDetails *struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"input_tokens_details"`
}

func (u *responsesUsage) usage() Usage {
	if u == nil {
		return Usage{}
	}
	out := Usage{Input: u.InputTokens, Output: u.OutputTokens}
	if u.InputDetails != nil {
		out.Cached = u.InputDetails.CachedTokens
	}
	return out
}

func (responsesAdapter) UsableModels(ids []string) []string { return openAIChatModels(ids) }

func (responsesAdapter) ParseReply(raw []byte) (Reply, bool) {
	if !json.Valid(raw) {
		return Reply{}, false
	}
	var parsed struct {
		Output []struct {
			Type      string `json:"type"`
			CallID    string `json:"call_id"`
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
			Content   []struct {
				Text    string `json:"text"`
				Refusal string `json:"refusal"`
			} `json:"content"`
		} `json:"output"`
		Usage    *responsesUsage `json:"usage"`
		Response *struct {
			Usage *responsesUsage `json:"usage"`
		} `json:"response"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Reply{}, false
	}
	reply := Reply{Usage: parsed.Usage.usage()}
	if reply.Usage == (Usage{}) && parsed.Response != nil {
		reply.Usage = parsed.Response.Usage.usage()
	}
	if parsed.Error != nil {
		reply.APIMessage = parsed.Error.Message
	}
	var parts []string
	for _, item := range parsed.Output {
		if item.Type == "function_call" {
			reply.ToolCalls = append(reply.ToolCalls, ToolCall{ID: item.CallID, Name: item.Name, Arguments: item.Arguments})
			continue
		}
		for _, content := range item.Content {
			text := strings.TrimSpace(content.Text)
			if text == "" {
				text = strings.TrimSpace(content.Refusal)
			}
			if text != "" {
				parts = append(parts, text)
			}
		}
	}
	reply.Text = strings.Join(parts, "\n")
	return reply, true
}

func (responsesAdapter) ParseStreamEvent(data string) StreamEvent {
	var event struct {
		Type        string `json:"type"`
		Delta       string `json:"delta"`
		Message     string `json:"message"`
		OutputIndex int    `json:"output_index"`
		Item        *struct {
			Type      string `json:"type"`
			CallID    string `json:"call_id"`
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"item"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
		Response *struct {
			Usage *responsesUsage `json:"usage"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		} `json:"response"`
	}
	if err := json.Unmarshal([]byte(data), &event); err != nil {
		return StreamEvent{}
	}
	switch {
	case event.Error != nil:
		return StreamEvent{Err: event.Error.Message}
	case event.Type == "error":
		return StreamEvent{Err: event.Message}
	case event.Type == "response.failed" && event.Response != nil && event.Response.Error != nil:
		return StreamEvent{Err: event.Response.Error.Message}
	case event.Type == "response.output_text.delta":
		return StreamEvent{Delta: event.Delta}
	// A finished function_call item carries the whole call, so the argument
	// deltas sent before it are not needed.
	case event.Type == "response.output_item.done" && event.Item != nil && event.Item.Type == "function_call":
		return StreamEvent{ToolCalls: []ToolCallDelta{{
			Index:     event.OutputIndex,
			ID:        event.Item.CallID,
			Name:      event.Item.Name,
			Arguments: event.Item.Arguments,
		}}}
	case event.Response != nil:
		return StreamEvent{Usage: event.Response.Usage.usage()}
	}
	return StreamEvent{}
}
