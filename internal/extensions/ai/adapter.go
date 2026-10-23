// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"fmt"
	"strings"
)

// Adapter is everything that differs between model APIs: the path a request
// goes to, the body it carries, and how a reply is read. The transport (HTTP,
// redirects, limits, logging) is the same for every adapter and lives in Send.
//
// A provider does not write its own transport or its own parsing. It names an
// adapter in its preset. A quirk that belongs to one provider's API goes inside
// the adapter that provider uses, and nowhere else.
type Adapter interface {
	// ID is the stable name a preset uses to pick this adapter.
	ID() string
	// Path is where requests go, appended to the base address.
	Path() string
	// BuildBody returns the exact JSON body for one turn. It always asks for a
	// streamed reply when turn.Stream is set.
	BuildBody(turn Turn) (string, error)
	// ParseReply reads one complete JSON reply. It reports false when the bytes
	// are not a reply this adapter understands.
	ParseReply(raw []byte) (Reply, bool)
	// ParseStreamEvent reads the data of one server-sent event. Events it does
	// not know are returned empty.
	ParseStreamEvent(data string) StreamEvent
	// UsableModels keeps the listed models this API can chat with. A host lists
	// everything it serves: embeddings, speech, images.
	UsableModels(ids []string) []string
}

const (
	// AdapterChat is the OpenAI chat-completions API and the hosts that copy it
	// (DeepSeek, Ollama, vLLM).
	AdapterChat = "openai-chat"
	// AdapterResponses is the OpenAI responses API that Codex models use.
	AdapterResponses = "openai-responses"
)

// Reply is what one complete model reply held.
type Reply struct {
	Text       string
	Usage      Usage
	APIMessage string
	ToolCalls  []ToolCall
}

// StreamEvent is what one server-sent event held. Reasoning is thinking text
// some models send before the answer; it is counted, never shown.
type StreamEvent struct {
	Delta     string
	Reasoning string
	Usage     Usage
	Err       string
	ToolCalls []ToolCallDelta
}

var adapters = map[string]Adapter{
	AdapterChat:      chatAdapter{},
	AdapterResponses: responsesAdapter{},
}

// AdapterByID returns the adapter a preset names.
func AdapterByID(id string) (Adapter, bool) {
	adapter, ok := adapters[id]
	return adapter, ok
}

// adapterForAddress picks the adapter for a model address. A named provider
// states its adapter in its preset. An address the user typed is read by its
// path: one that ends in /responses uses the responses API, anything else is
// taken as chat completions.
func adapterForAddress(host, path string) Adapter {
	if preset, ok := MatchPresetByHost(host); ok {
		if adapter, found := AdapterByID(preset.Adapter); found {
			return adapter
		}
	}
	if strings.HasSuffix(strings.TrimRight(path, "/"), "/responses") {
		return adapters[AdapterResponses]
	}
	return adapters[AdapterChat]
}

func validateTurn(turn Turn) error {
	if strings.TrimSpace(turn.Model) == "" {
		return fmt.Errorf("model name is required")
	}
	if strings.TrimSpace(turn.UserText) == "" {
		return fmt.Errorf("message is required")
	}
	return nil
}
