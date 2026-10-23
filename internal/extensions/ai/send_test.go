// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func endpointFor(t *testing.T, url, adapterID string) Endpoint {
	t.Helper()
	return Endpoint{URL: url, Adapter: mustAdapter(t, adapterID), Loopback: true}
}

func TestSendJoinsStreamedDeltasAndReportsUsage(t *testing.T) {
	var sawAuth, sawBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		sawBody = string(raw)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(
			"data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n" +
				"data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n" +
				"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":2}}\n\n" +
				"data: [DONE]\n\n"))
	}))
	defer server.Close()

	var seen []string
	result, err := Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "secret-key", `{"model":"m"}`, func(text string) {
		seen = append(seen, text)
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "Hello" || strings.Join(seen, "|") != "Hel|lo" {
		t.Fatalf("reply %q deltas %v", result.Text, seen)
	}
	if result.Usage != (Usage{Input: 10, Output: 2}) {
		t.Fatalf("usage %+v", result.Usage)
	}
	if sawAuth != "Bearer secret-key" || !strings.Contains(sawBody, `"model":"m"`) {
		t.Fatal("the request was not the prepared body")
	}
}

func TestSendStreamsResponsesEvents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(
			"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"select \"}\n\n" +
				"data: {\"type\":\"response.output_text.delta\",\"delta\":\"1\"}\n\n" +
				"data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":7,\"output_tokens\":3}}}\n\n"))
	}))
	defer server.Close()

	result, err := Send(context.Background(), endpointFor(t, server.URL, AdapterResponses), "", `{}`, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "select 1" || result.Usage != (Usage{Input: 7, Output: 3}) {
		t.Fatalf("result %+v", result)
	}
}

func TestSendReadsAWholeJSONReplyFromAHostThatDoesNotStream(t *testing.T) {
	cases := map[string]struct {
		adapter string
		body    string
	}{
		"chat":      {AdapterChat, `{"choices":[{"message":{"content":"Bảng lưu lịch ca."}}],"usage":{"prompt_tokens":90,"completion_tokens":12}}`},
		"responses": {AdapterResponses, `{"output":[{"content":[{"text":"Bảng lưu lịch ca."}]}],"usage":{"input_tokens":90,"output_tokens":12}}`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			var seen []string
			result, err := Send(context.Background(), endpointFor(t, server.URL, tc.adapter), "", `{}`, func(text string) {
				seen = append(seen, text)
			})
			if err != nil {
				t.Fatalf("a complete JSON reply was rejected: %v", err)
			}
			if result.Text != "Bảng lưu lịch ca." || len(seen) != 1 || result.Usage != (Usage{Input: 90, Output: 12}) {
				t.Fatalf("result %+v deltas %v", result, seen)
			}
		})
	}
}

func TestSendRefusesARedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.invalid/", http.StatusFound)
	}))
	defer server.Close()

	if _, err := Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "k", `{}`, nil); err == nil {
		t.Fatal("a redirect was followed")
	}
}

func TestSendKeepsTheHostsErrorMessageButNeverTheKey(t *testing.T) {
	status := http.StatusBadRequest
	message := "model not found"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"error":{"message":"` + message + `"}}`))
	}))
	defer server.Close()

	_, err := Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "", `{}`, nil)
	if err == nil || !strings.Contains(err.Error(), "model not found") {
		t.Fatalf("the host's message was lost: %v", err)
	}

	message = "bad key secret-key"
	_, err = Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "secret-key", `{}`, nil)
	if err == nil || strings.Contains(err.Error(), "secret-key") {
		t.Fatalf("the key reached the error: %v", err)
	}

	status = http.StatusOK
	message = "model not found"
	_, err = Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "", `{}`, nil)
	if err == nil || !strings.Contains(err.Error(), "model not found") {
		t.Fatalf("an error body on HTTP 200 was lost: %v", err)
	}
}

func TestSendNamesWhatArrivedWhenTheReplyIsEmpty(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"thinking\"}}]}\n\ndata: [DONE]\n\n"))
	}))
	defer server.Close()

	_, err := Send(context.Background(), endpointFor(t, server.URL, AdapterChat), "", `{}`, nil)
	if err == nil {
		t.Fatal("an empty stream was accepted")
	}
	for _, want := range []string{"HTTP 200", "1 data lines", "0 text fragments", "1 reasoning fragments", "only returned reasoning"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error %q is missing %q", err.Error(), want)
		}
	}
}

func TestSendNeedsAnAdapter(t *testing.T) {
	if _, err := Send(context.Background(), Endpoint{URL: "http://127.0.0.1:1"}, "", `{}`, nil); err == nil {
		t.Fatal("a send with no adapter went through")
	}
}
