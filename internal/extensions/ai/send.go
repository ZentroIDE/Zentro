// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const maxReplyBytes = 256 << 10

// Result is a complete model reply.
// ToolCalls is set when the model asked for tools instead of, or before, an
// answer. The caller runs them and sends a follow-up.
type Result struct {
	Text      string
	Usage     Usage
	ToolCalls []ToolCall
}

// Send posts the exact body to the endpoint and returns the whole reply. It is
// the one transport for every provider: the endpoint's adapter reads what comes
// back. onDelta, when set, gets each text fragment as it arrives.
//
// A host may ignore the request to stream and answer with one JSON object. That
// is read as a complete reply. Redirects are refused, the reply is capped, and
// neither the key nor the body is ever logged.
func Send(ctx context.Context, endpoint Endpoint, apiKey, body string, onDelta func(string)) (Result, error) {
	adapter := endpoint.Adapter
	if adapter == nil {
		return Result{}, fmt.Errorf("model address has no adapter")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.URL, strings.NewReader(body))
	if err != nil {
		return Result{}, fmt.Errorf("build model request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream, application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Result{}, fmt.Errorf("the reply was stopped")
		}
		return Result{}, fmt.Errorf("model request failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return Result{}, fmt.Errorf("model host returned a redirect, which was not followed")
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		reply, _ := adapter.ParseReply(raw)
		return Result{}, rejection(reply.APIMessage, apiKey, resp.StatusCode)
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "application/json") {
		return readWholeReply(adapter, resp, apiKey, onDelta)
	}
	return readStream(ctx, adapter, resp, apiKey, onDelta)
}

// rejection is the error for a request the host refused. The host's own message
// is kept unless it echoes the key.
func rejection(message, apiKey string, status int) error {
	if message != "" && !mentionsKey(message, apiKey) {
		return fmt.Errorf("model rejected the request: %s", message)
	}
	return fmt.Errorf("model rejected the request (%d)", status)
}

func readWholeReply(adapter Adapter, resp *http.Response, apiKey string, onDelta func(string)) (Result, error) {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxReplyBytes*4))
	if err != nil {
		return Result{}, fmt.Errorf("the reply could not be read")
	}
	reply, understood := adapter.ParseReply(raw)
	if !understood || (reply.APIMessage != "" && reply.Text == "") {
		if reply.APIMessage != "" && !mentionsKey(reply.APIMessage, apiKey) {
			return Result{}, fmt.Errorf("model rejected the request: %s", reply.APIMessage)
		}
		return Result{}, fmt.Errorf("model response was not understood")
	}
	if reply.Text == "" && len(reply.ToolCalls) == 0 {
		return Result{Usage: reply.Usage}, fmt.Errorf("model returned an empty reply (HTTP %d, application/json, no content)", resp.StatusCode)
	}
	if len(reply.Text) > maxReplyBytes {
		return Result{}, fmt.Errorf("model reply was too long")
	}
	if onDelta != nil && reply.Text != "" {
		onDelta(reply.Text)
	}
	return Result{Text: reply.Text, Usage: reply.Usage, ToolCalls: reply.ToolCalls}, nil
}

func readStream(ctx context.Context, adapter Adapter, resp *http.Response, apiKey string, onDelta func(string)) (Result, error) {
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	var text strings.Builder
	var usage Usage
	var calls toolCallBuilder
	diag := streamDiagnostics{status: resp.StatusCode, contentType: resp.Header.Get("Content-Type")}
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			diag.noteOtherLine(adapter, line, apiKey)
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		diag.dataLines++
		event := adapter.ParseStreamEvent(data)
		if event.Err != "" {
			return Result{}, fmt.Errorf("model rejected the request: %s", event.Err)
		}
		if event.Reasoning != "" {
			diag.reasoningFragments++
		}
		if event.Delta != "" {
			diag.textFragments++
			if text.Len()+len(event.Delta) > maxReplyBytes {
				return Result{}, fmt.Errorf("model reply was too long")
			}
			text.WriteString(event.Delta)
			if onDelta != nil {
				onDelta(event.Delta)
			}
		}
		for _, delta := range event.ToolCalls {
			calls.add(delta)
		}
		if event.Usage != (Usage{}) {
			usage = event.Usage
		}
	}
	if err := scanner.Err(); err != nil {
		if ctx.Err() != nil {
			return Result{}, fmt.Errorf("the reply was stopped")
		}
		return Result{}, fmt.Errorf("the reply stream broke")
	}
	reply := strings.TrimSpace(text.String())
	toolCalls := calls.result()
	if reply == "" && len(toolCalls) == 0 {
		return Result{Usage: usage}, diag.emptyError()
	}
	return Result{Text: reply, Usage: usage, ToolCalls: toolCalls}, nil
}

// streamDiagnostics records what a stream contained, without any user text or
// the key. It explains an empty reply in the error and in the log.
type streamDiagnostics struct {
	status             int
	contentType        string
	dataLines          int
	textFragments      int
	reasoningFragments int
	otherLine          string
	providerMessage    string
}

func (d *streamDiagnostics) noteOtherLine(adapter Adapter, line, apiKey string) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || d.otherLine != "" {
		return
	}
	if apiKey != "" {
		trimmed = strings.ReplaceAll(trimmed, apiKey, "[key]")
	}
	if len(trimmed) > 120 {
		trimmed = trimmed[:120]
	}
	d.otherLine = trimmed
	if reply, ok := adapter.ParseReply([]byte(trimmed)); ok && reply.APIMessage != "" {
		d.providerMessage = reply.APIMessage
	}
}

func (d streamDiagnostics) emptyError() error {
	detail := fmt.Sprintf("HTTP %d, %s, %d data lines, %d text fragments, %d reasoning fragments",
		d.status, d.contentType, d.dataLines, d.textFragments, d.reasoningFragments)
	if d.providerMessage != "" {
		detail += ", provider said: " + d.providerMessage
	} else if d.otherLine != "" {
		detail += ", first non-stream line: " + d.otherLine
	}
	if d.reasoningFragments > 0 && d.textFragments == 0 {
		detail += " (the model only returned reasoning)"
	}
	return fmt.Errorf("model returned an empty reply (%s)", detail)
}

// mentionsKey reports whether a provider message echoes the API key. An empty
// key matches nothing, so the message is kept.
func mentionsKey(message, apiKey string) bool {
	return apiKey != "" && strings.Contains(message, apiKey)
}
