// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/extensions/ai"
)

// approvalEmitter answers every row approval with decision and records what
// it saw.
type approvalEmitter struct {
	mu        sync.Mutex
	svc       *AIService
	decision  bool
	approvals []AIChatApproval
	rounds    []AISentRound
}

func (e *approvalEmitter) Emit(_ context.Context, name string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	switch name {
	case constant.EventAIChatApproval:
		approval := payload.(AIChatApproval)
		e.approvals = append(e.approvals, approval)
		_ = e.svc.ResolveChatApproval(approval.RequestID, e.decision)
	case constant.EventAIChatRound:
		e.rounds = append(e.rounds, payload.(AISentRound))
	}
}

const rowMarker = "ok-marker"

// rowReadingModel asks for rows from env once, then answers.
func rowReadingModel(t *testing.T, env string, bodies *[]string) *httptest.Server {
	t.Helper()
	var mu sync.Mutex
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		mu.Lock()
		*bodies = append(*bodies, string(raw))
		n := len(*bodies)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if n == 1 {
			args := `{\"env\":\"` + env + `\",\"sql\":\"SELECT id, status || '-marker' AS s FROM users ORDER BY id\"}`
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"run_readonly_query","arguments":"` + args + `"}}]}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Done."}}]}`))
	}))
}

func dataModeChat(t *testing.T, env string, decision bool) (*AIService, *approvalEmitter, *[]string, AISendResult, string) {
	t.Helper()
	bodies := &[]string{}
	server := rowReadingModel(t, env, bodies)
	t.Cleanup(server.Close)
	svc := readDataFixture(t)
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, BaseURL: server.URL + "/v1", Model: "local", AllowReadData: true, DataMode: true}); err != nil {
		t.Fatal(err)
	}
	emitter := &approvalEmitter{svc: svc, decision: decision}
	svc.emitter = emitter
	session, err := svc.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "show users", SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	result, err := svc.Send(context.Background(), AISendRequest{Message: "show users", SessionID: session.ID, SendToken: preview.SendToken, RequestID: "req-1"})
	if err != nil {
		t.Fatal(err)
	}
	return svc, emitter, bodies, result, session.ID
}

func TestProductionRowsAskEvenForALocalModelAndGoWhenApproved(t *testing.T) {
	_, emitter, bodies, result, _ := dataModeChat(t, "pro", true)
	if len(emitter.approvals) != 1 {
		t.Fatalf("approvals %d", len(emitter.approvals))
	}
	approval := emitter.approvals[0]
	if !approval.Production || approval.Env != "pro" || len(approval.Results) != 1 || approval.Results[0].Rows != 2 {
		t.Fatalf("approval %+v", approval)
	}
	if !strings.Contains(approval.Results[0].Content, rowMarker) {
		t.Fatal("the dialog did not show the rows that would be sent")
	}
	if len(*bodies) != 2 || !strings.Contains((*bodies)[1], rowMarker) {
		t.Fatal("approved rows did not reach the model")
	}
	if len(result.Rounds) != 2 || !result.Rounds[1].CarriesRows {
		t.Fatalf("rounds %+v", result.Rounds)
	}
}

func TestDeclinedRowsNeverReachTheModel(t *testing.T) {
	_, emitter, bodies, _, _ := dataModeChat(t, "pro", false)
	if len(emitter.approvals) != 1 {
		t.Fatalf("approvals %d", len(emitter.approvals))
	}
	if strings.Contains((*bodies)[1], rowMarker) {
		t.Fatal("declined rows were sent")
	}
	if !strings.Contains((*bodies)[1], "declined to share") {
		t.Fatal("the model was not told the user declined")
	}
}

func TestLocalModelOutsideProductionDoesNotAsk(t *testing.T) {
	_, emitter, bodies, _, _ := dataModeChat(t, "dev", false)
	if len(emitter.approvals) != 0 {
		t.Fatalf("a local model on dev asked: %+v", emitter.approvals)
	}
	if !strings.Contains((*bodies)[1], rowMarker) {
		t.Fatal("rows for a local model on dev were not sent")
	}
}

func TestEveryRoundIsShownLiveAndSavedWithoutRows(t *testing.T) {
	svc, emitter, bodies, _, sessionID := dataModeChat(t, "pro", true)
	if len(emitter.rounds) != len(*bodies) {
		t.Fatalf("%d rounds emitted for %d requests", len(emitter.rounds), len(*bodies))
	}
	for i, round := range emitter.rounds {
		if round.Body != (*bodies)[i] || round.Bytes != len((*bodies)[i]) {
			t.Fatalf("round %d is not the exact bytes sent", i)
		}
	}
	projectID, _ := svc.projectID()
	session, err := svc.sessionStore().load(projectID, sessionID)
	if err != nil {
		t.Fatal(err)
	}
	reply := session.Turns[len(session.Turns)-1]
	if len(reply.Rounds) != 2 {
		t.Fatalf("saved rounds %+v", reply.Rounds)
	}
	if strings.Contains(reply.Rounds[1].Body, rowMarker) {
		t.Fatal("a saved session kept row values")
	}
	if !strings.Contains(reply.Rounds[1].Body, "were shared with") {
		t.Fatal("the saved round does not say rows were shared")
	}
}

func TestResolvingAReplyThatIsNotWaitingFails(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if err := svc.ResolveChatApproval("nothing", true); err == nil {
		t.Fatal("an answer with no waiting reply was accepted")
	}
}

func TestNoOneToAskMeansNo(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if svc.awaitRowApproval(context.Background(), context.Background(), AIChatApproval{}) {
		t.Fatal("an approval with no request ID passed")
	}
}

func TestCloudRowsAlwaysAsk(t *testing.T) {
	if !rowsNeedApproval(ai.Endpoint{Loopback: false}, "dev") {
		t.Fatal("rows for a cloud model on dev did not ask")
	}
	if rowsNeedApproval(ai.Endpoint{Loopback: true}, "sta") {
		t.Fatal("rows for a local model on staging asked")
	}
	if !rowsNeedApproval(ai.Endpoint{Loopback: true}, "pro") {
		t.Fatal("production rows for a local model did not ask")
	}
}
