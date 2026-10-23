// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/extensions/ai"
)

type recordingEmitter struct {
	mu     sync.Mutex
	deltas []AIChatDelta
}

func (r *recordingEmitter) Emit(_ context.Context, name string, payload any) {
	if name != constant.EventAIChatDelta {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if delta, ok := payload.(AIChatDelta); ok {
		r.deltas = append(r.deltas, delta)
	}
}

// newReviewService is newTestAIService with a session directory and a
// catalog the test can change.
func newReviewService(t *testing.T, baseURL string, tables *[]ai.Table) *AIService {
	t.Helper()
	svc := newTestAIService(t, baseURL)
	svc.sessionsDir = t.TempDir()
	svc.catalogFn = func(context.Context, string, bool, bool) (ai.Catalog, error) {
		return ai.Catalog{Schema: "public", Tables: *tables}, nil
	}
	return svc
}

func defaultTables() []ai.Table {
	return []ai.Table{{
		Name: "orders",
		Columns: []ai.Column{
			{Name: "id", DataType: "int", PrimaryKey: true},
			{Name: "status", DataType: "text"},
		},
	}}
}

func chatServer(t *testing.T, captured *string, reply string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if captured != nil {
			*captured = string(raw)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":` + quote(reply) + `}}],"usage":{"prompt_tokens":40,"completion_tokens":5}}`))
	}))
}

func quote(text string) string {
	return `"` + strings.NewReplacer("\\", `\\`, "\"", `\"`, "\n", `\n`).Replace(text) + `"`
}

func TestGrantSkipsReviewUntilTheTermsChange(t *testing.T) {
	var captured string
	server := chatServer(t, &captured, "Use this.\n<suggestions>[\"Show orders by status\"]</suggestions>")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)

	session, err := svc.CreateSession()
	if err != nil {
		t.Fatal(err)
	}

	preview, err := svc.Preview(context.Background(), AIPreviewRequest{
		Message:      "count orders",
		SessionID:    session.ID,
		GrantSession: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !preview.Granted || preview.Data == "" || preview.EstimatedTokens == 0 {
		t.Fatalf("grant not recorded: %+v", preview)
	}

	sent, err := svc.Send(context.Background(), AISendRequest{Message: "count orders", SessionID: session.ID})
	if err != nil {
		t.Fatalf("granted send was refused: %v", err)
	}
	if len(sent.Suggestions) != 1 || strings.Contains(sent.Reply, "suggestions") {
		t.Fatalf("suggestions not split: %+v", sent)
	}

	// The chat froze its memory block on the first question, so the granted
	// system message stays the same. A table created later rides on the next
	// question as added context (shown in "Sent to"), not in the frozen block.
	if _, err := svc.Send(context.Background(), AISendRequest{Message: "again", SessionID: session.ID}); err != nil {
		t.Fatalf("the same schema asked again: %v", err)
	}
	tables = append(tables, ai.Table{Name: "customers"})
	sent, err = svc.Send(context.Background(), AISendRequest{Message: "again", SessionID: session.ID})
	if err != nil {
		t.Fatalf("a table added to a granted chat asked again: %v", err)
	}
	if !strings.Contains(captured, "New tables: customers") {
		t.Fatalf("the new table did not ride on the question: %s", captured)
	}
	// Allowing object text is a different permission, so it asks again.
	if _, err := svc.Send(context.Background(), AISendRequest{Message: "again", SessionID: session.ID, IncludeBodies: true}); err == nil {
		t.Fatal("turning on object text reused the old grant")
	}
}

func TestSendWithoutGrantOrTokenIsRefused(t *testing.T) {
	server := chatServer(t, nil, "ok")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, _ := svc.CreateSession()

	if _, err := svc.Send(context.Background(), AISendRequest{Message: "hi", SessionID: session.ID}); err == nil {
		t.Fatal("a send without review went through")
	}
}

func TestMentionsMustExistInActiveCatalog(t *testing.T) {
	catalog := ai.Catalog{Tables: defaultTables()}

	got, err := resolveMentions(catalog, []string{"@ORDERS.status", "orders", "orders.status"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got, ",") != "orders.status,orders" {
		t.Fatalf("canonical names %v", got)
	}
	if _, err := resolveMentions(catalog, []string{"@prod_users"}); err == nil {
		t.Fatal("a table outside the active schema was accepted")
	}
	if _, err := resolveMentions(catalog, []string{"orders.secret"}); err == nil {
		t.Fatal("an unknown column was accepted")
	}
}

func TestSessionKeepsTurnsAndSendsHistory(t *testing.T) {
	var captured string
	server := chatServer(t, &captured, "first answer")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, _ := svc.CreateSession()
	if _, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "q1", SessionID: session.ID, GrantSession: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Send(context.Background(), AISendRequest{Message: "what is orders", SessionID: session.ID}); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.Send(context.Background(), AISendRequest{Message: "and now?", SessionID: session.ID}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(captured, "what is orders") || !strings.Contains(captured, "first answer") {
		t.Fatalf("second request did not carry the first turn: %s", captured)
	}

	saved, err := svc.GetSession(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Turns) != 4 || saved.Title != "what is orders" {
		t.Fatalf("saved session %+v", saved)
	}
	if saved.Turns[1].Usage == nil || saved.Turns[1].Usage.Input != 40 {
		t.Fatalf("usage not kept: %+v", saved.Turns[1].Usage)
	}
}

func TestStreamEmitsDeltasWithRequestID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(
			"data: {\"choices\":[{\"delta\":{\"content\":\"SELECT \"}}]}\n\n" +
				"data: {\"choices\":[{\"delta\":{\"content\":\"1\"}}]}\n\n" +
				"data: [DONE]\n\n"))
	}))
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	emitter := &recordingEmitter{}
	svc.emitter = emitter
	preview, _ := svc.Preview(context.Background(), AIPreviewRequest{Message: "one"})
	result, err := svc.Send(context.Background(), AISendRequest{
		Message:   "one",
		SendToken: preview.SendToken,
		RequestID: "req-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Reply != "SELECT 1" {
		t.Fatalf("reply %q", result.Reply)
	}
	if len(emitter.deltas) != 2 || emitter.deltas[0].RequestID != "req-1" {
		t.Fatalf("deltas %+v", emitter.deltas)
	}
}

func TestSessionStoreRejectsBadIDsAndHashesProject(t *testing.T) {
	root := t.TempDir()
	store := &aiSessionStore{root: root}
	session, err := store.create("../../escape", "deepseek", "deepseek-chat")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.load("../../escape", "../evil"); err == nil {
		t.Fatal("a path-like session id was accepted")
	}
	items, err := store.list("../../escape")
	if err != nil || len(items) != 1 || items[0].ID != session.ID {
		t.Fatalf("list %+v %v", items, err)
	}
	if err := store.remove("../../escape", session.ID); err != nil {
		t.Fatal(err)
	}
	items, _ = store.list("../../escape")
	if len(items) != 0 {
		t.Fatal("delete left the session behind")
	}
}

func TestFailedStreamIsLogged(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	var logs strings.Builder
	svc.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	preview, _ := svc.Preview(context.Background(), AIPreviewRequest{Message: "one"})

	_, err := svc.Send(context.Background(), AISendRequest{Message: "one", SendToken: preview.SendToken, RequestID: "req-log"})
	if err == nil {
		t.Fatal("an empty stream was accepted")
	}
	if !strings.Contains(logs.String(), "assistant reply failed") || !strings.Contains(logs.String(), "data lines") {
		t.Fatalf("failure not logged: %s", logs.String())
	}
}

func TestSchemaCanBeMentioned(t *testing.T) {
	catalog := ai.Catalog{Schema: "public", Tables: defaultTables()}
	got, err := resolveMentions(catalog, []string{"@public", "orders"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got, ",") != "public,orders" {
		t.Fatalf("got %v", got)
	}
}

func TestListsReachTheUINeverNull(t *testing.T) {
	server := chatServer(t, nil, "plain answer with no follow-ups")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, _ := svc.CreateSession()

	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "list orders", SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Matches == nil {
		t.Fatal("preview matches must be [] and not null")
	}
	sent, err := svc.Send(context.Background(), AISendRequest{
		Message: "list orders", SessionID: session.ID, SendToken: preview.SendToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	if sent.Suggestions == nil {
		t.Fatal("suggestions must be [] and not null")
	}

	saved, err := svc.GetSession(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, turn := range saved.Turns {
		if turn.Suggestions == nil {
			t.Fatalf("turn %s has null suggestions", turn.ID)
		}
	}
}

func TestOldSessionFileWithNullSuggestionsIsRepairedOnLoad(t *testing.T) {
	store := &aiSessionStore{root: t.TempDir()}
	session, err := store.create("proj", "deepseek", "deepseek-chat")
	if err != nil {
		t.Fatal(err)
	}
	path, _ := store.path("proj", session.ID)
	old := `{"id":"` + session.ID + `","title":"x","turns":[{"id":"t1","role":"assistant","text":"hi","suggestions":null}]}`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.load("proj", session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Turns[0].Suggestions == nil {
		t.Fatal("an old file still loads null suggestions")
	}
}

func TestSavedReplyWithToolMarkupIsSplitOnLoad(t *testing.T) {
	store := &aiSessionStore{root: t.TempDir()}
	session, err := store.create("proj", "deepseek", "deepseek-chat")
	if err != nil {
		t.Fatal(err)
	}
	path, _ := store.path("proj", session.ID)
	text := "Bảng lưu lịch ca.\n\n< | DSML | invoke name=\"suggestions\">[\"Câu một\"]</ | DSML | invoke>"
	file, _ := json.Marshal(map[string]any{
		"id":    session.ID,
		"title": "x",
		"turns": []map[string]any{{"id": "t1", "role": "assistant", "text": text, "suggestions": nil}},
	})
	old := string(file)
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := store.load("proj", session.ID)
	if err != nil {
		t.Fatal(err)
	}
	turn := loaded.Turns[0]
	if strings.Contains(turn.Text, "DSML") || len(turn.Suggestions) != 1 {
		t.Fatalf("turn %+v", turn)
	}
}

func TestReviewedBodyAsksForAStreamedReply(t *testing.T) {
	server := chatServer(t, nil, "ok")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)

	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "list orders"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(preview.Body, `"stream":true`) {
		t.Fatalf("the reviewed body does not ask for a stream, so a host would not stream: %s", preview.Body)
	}
}

func TestChooseModelFollowsTheListTheHostReturned(t *testing.T) {
	svc := newReviewService(t, "http://127.0.0.1:1", &[]ai.Table{})
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "https://api.deepseek.com/v1"}); err != nil {
		t.Fatal(err)
	}
	modelNow := func() string {
		view, err := svc.GetSettings()
		if err != nil {
			t.Fatal(err)
		}
		return view.Model
	}
	if modelNow() != "" {
		t.Fatalf("a model appeared before any list: %q", modelNow())
	}

	// First list: nothing chosen yet, so the hint wins.
	if err := svc.chooseModel("proj", "api.deepseek.com", []string{"deepseek-reasoner", "deepseek-chat-v4"}, "deepseek-chat"); err != nil {
		t.Fatal(err)
	}
	if modelNow() != "deepseek-chat-v4" {
		t.Fatalf("hint pick %q", modelNow())
	}

	// A later list that still has the model changes nothing.
	if err := svc.chooseModel("proj", "api.deepseek.com", []string{"a", "deepseek-chat-v4"}, "deepseek-chat"); err != nil {
		t.Fatal(err)
	}
	if modelNow() != "deepseek-chat-v4" {
		t.Fatalf("a listed model was replaced: %q", modelNow())
	}

	// The host retired it: the next list replaces it.
	if err := svc.chooseModel("proj", "api.deepseek.com", []string{"deepseek-chat-v5"}, "deepseek-chat"); err != nil {
		t.Fatal(err)
	}
	if modelNow() != "deepseek-chat-v5" {
		t.Fatalf("a retired model stayed: %q", modelNow())
	}

	// A list for a provider that is not active changes nothing.
	if err := svc.chooseModel("proj", "api.openai.com", []string{"gpt-5"}, "gpt-5"); err != nil {
		t.Fatal(err)
	}
	if modelNow() != "deepseek-chat-v5" {
		t.Fatalf("another provider's list moved the model: %q", modelNow())
	}
}

func TestProviderThatIsNotActiveShowsItsBestKnownModelOrNone(t *testing.T) {
	svc := newReviewService(t, "http://127.0.0.1:1", &[]ai.Table{})
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: "https://api.deepseek.com/v1"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.rememberModels("proj", "api.openai.com", []string{"alpha", "gpt-5.1-codex"}); err != nil {
		t.Fatal(err)
	}
	view, err := svc.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	for _, provider := range view.Providers {
		switch provider.ID {
		case "codex":
			if provider.Model != "gpt-5.1-codex" {
				t.Fatalf("codex shows %q", provider.Model)
			}
		case "deepseek":
			if provider.Model != "" {
				t.Fatalf("deepseek shows %q with no list", provider.Model)
			}
		}
	}
}

func TestSendingWithNoModelSaysWhatToDo(t *testing.T) {
	server := chatServer(t, nil, "ok")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: server.URL + "/v1"}); err != nil {
		t.Fatal(err)
	}

	_, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "hi"})
	if err == nil || !strings.Contains(err.Error(), "choose a model first") {
		t.Fatalf("error %v", err)
	}
}
