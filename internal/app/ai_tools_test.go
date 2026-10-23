// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/extensions/ai"
)

func toolCatalog() ai.Catalog {
	return ai.Catalog{
		Schema: "public",
		Tables: []ai.Table{
			{Name: "orders", Columns: []ai.Column{
				{Name: "id", DataType: "int", PrimaryKey: true},
				{Name: "customer_id", DataType: "int"},
				{Name: "status", DataType: "text", Nullable: true},
			}},
			{Name: "customers", Columns: []ai.Column{{Name: "id", DataType: "int", PrimaryKey: true}}},
		},
		Indexes:     []ai.Object{{Kind: "index", Name: "orders_status_idx", Table: "orders"}},
		Constraints: []ai.Object{{Kind: "constraint", Name: "orders_customer_fk", Table: "orders", Signature: "FOREIGN KEY"}},
		Views:       []ai.Object{{Kind: "view", Name: "open_orders", Body: "select id from orders where status = ?"}},
	}
}

func toolService(t *testing.T, baseURL string) *AIService {
	t.Helper()
	svc := newTestAIService(t, baseURL)
	svc.sessionsDir = t.TempDir()
	svc.catalogFn = func(context.Context, string, bool, bool) (ai.Catalog, error) {
		return toolCatalog(), nil
	}
	return svc
}

func TestSearchSchemaFindsTablesAndColumnsByPartOfAName(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "search_schema", `{"query":"customer"}`, false)
	var data aiSchemaSearchData
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Hits) != 2 {
		t.Fatalf("search hits %+v", data.Hits)
	}
	byKind := map[string]aiSchemaSearchHit{}
	for _, hit := range data.Hits {
		byKind[hit.Kind] = hit
	}
	table, ok := byKind["table"]
	if !ok || table.Name != "customers" || table.Columns != 1 {
		t.Fatalf("table hit %+v", table)
	}
	column, ok := byKind["column"]
	if !ok || column.Table != "orders" || column.Name != "customer_id" || column.Type != "int" {
		t.Fatalf("column hit %+v", column)
	}

	columns := svc.runTool(context.Background(), "search_schema", `{"query":"id","kind":"column"}`, false)
	var colData aiSchemaSearchData
	if err := json.Unmarshal(requireOK(t, columns.Content).Data, &colData); err != nil {
		t.Fatal(err)
	}
	for _, hit := range colData.Hits {
		if hit.Kind == "table" {
			t.Fatalf("kind column returned a table: %+v", colData.Hits)
		}
	}
}

func TestDescribeTableGivesColumnsKeysAndIndexes(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "describe_table", `{"table":"public.orders"}`, false)
	var data aiDescribeTableData
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Schema != "public" || data.Table != "orders" {
		t.Fatalf("table %+v", data)
	}
	if len(data.Columns) != 3 || data.Columns[0].Name != "id" || data.Columns[0].Type != "int" || !data.Columns[0].PrimaryKey || !data.Columns[0].NotNull {
		t.Fatalf("id column %+v", data.Columns)
	}
	var status *aiTableColumn
	for i := range data.Columns {
		if data.Columns[i].Name == "status" {
			status = &data.Columns[i]
		}
	}
	if status == nil || status.Type != "text" {
		t.Fatalf("status column missing: %+v", data.Columns)
	}
	if len(data.Indexes) != 1 || data.Indexes[0].Name != "orders_status_idx" {
		t.Fatalf("indexes %+v", data.Indexes)
	}
	if len(data.Constraints) != 1 || data.Constraints[0].Name != "orders_customer_fk" || data.Constraints[0].Signature != "FOREIGN KEY" {
		t.Fatalf("constraints %+v", data.Constraints)
	}

	missing := svc.runTool(context.Background(), "describe_table", `{"table":"prod_users"}`, false)
	if !missing.Failed || !strings.Contains(missing.Content, "use search_schema") {
		t.Fatalf("an unknown table was described: %+v", missing)
	}
}

func TestDefinitionNeedsTheIncludeTextSwitch(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	off := svc.runTool(context.Background(), "get_definition", `{"name":"open_orders"}`, false)
	if !off.Failed || !strings.Contains(off.Content, "object text is off") {
		t.Fatalf("a definition came back with the switch off: %+v", off)
	}
	on := svc.runTool(context.Background(), "get_definition", `{"name":"open_orders"}`, true)
	if on.Failed || !strings.Contains(on.Content, "select id from orders") {
		t.Fatalf("definition %+v", on)
	}
}

func TestToolRejectsBadInputWithoutFailingTheReply(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	for name, args := range map[string]string{
		"run_sql":        `{"sql":"select 1"}`,
		"search_schema":  `not json`,
		"describe_table": `{"table":42}`,
	} {
		out := svc.runTool(context.Background(), name, args, false)
		if !out.Failed || out.Content == "" {
			t.Fatalf("%s %s: %+v", name, args, out)
		}
	}
}

func TestToolResultThatLooksSensitiveIsWithheld(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.catalogFn = func(context.Context, string, bool, bool) (ai.Catalog, error) {
		catalog := toolCatalog()
		catalog.Tables = append(catalog.Tables, ai.Table{Name: "contact_person_at_example_com", Columns: []ai.Column{{Name: "admin@example.com", DataType: "text"}}})
		return catalog, nil
	}
	out := svc.runTool(context.Background(), "search_schema", `{"query":"example"}`, false)
	if !out.Withheld || strings.Contains(out.Content, "admin@example.com") {
		t.Fatalf("a sensitive result went out: %+v", out)
	}
}

type toolEmitter struct {
	mu     sync.Mutex
	labels []string
}

func (e *toolEmitter) Emit(_ context.Context, name string, payload any) {
	if name != constant.EventAIChatTool {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.labels = append(e.labels, payload.(AIChatTool).Label)
}

func TestReplyRunsTheToolsTheModelAsksForThenAnswers(t *testing.T) {
	var bodies []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		bodies = append(bodies, string(raw))
		w.Header().Set("Content-Type", "application/json")
		if len(bodies) == 1 {
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"","tool_calls":[{"id":"c1","type":"function","function":{"name":"describe_table","arguments":"{\"table\":\"orders\"}"}}]}}],"usage":{"prompt_tokens":100,"completion_tokens":5}}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Use orders.status."}}],"usage":{"prompt_tokens":150,"completion_tokens":7}}`))
	}))
	defer server.Close()
	svc := toolService(t, server.URL)
	emitter := &toolEmitter{}
	svc.emitter = emitter
	session, _ := svc.CreateSession()

	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "which column holds the state?", SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(preview.Body, "customer_id int") || strings.Contains(preview.Body, "status text") {
		t.Fatalf("the first request carried schema structure: %s", preview.Body)
	}
	if !strings.Contains(preview.Body, `"search_schema"`) {
		t.Fatalf("the first request offered no tools: %s", preview.Body)
	}

	sent, err := svc.Send(context.Background(), AISendRequest{
		Message: "which column holds the state?", SessionID: session.ID, SendToken: preview.SendToken, RequestID: "r1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if sent.Reply != "Use orders.status." {
		t.Fatalf("reply %q", sent.Reply)
	}
	if len(bodies) != 2 || !strings.Contains(bodies[1], `"tool_call_id":"c1"`) || !strings.Contains(bodies[1], "primaryKey") {
		t.Fatalf("the follow-up did not carry the tool result: %v", bodies)
	}
	if sent.Usage == nil || sent.Usage.Input != 250 || sent.Usage.Output != 12 {
		t.Fatalf("usage of both rounds was not added up: %+v", sent.Usage)
	}
	if len(emitter.labels) != 1 || emitter.labels[0] != "Looked at orders" {
		t.Fatalf("tool events %v", emitter.labels)
	}
	saved, _ := svc.GetSession(session.ID)
	if got := saved.Turns[1].Tools; len(got) != 1 || got[0] != "Looked at orders" {
		t.Fatalf("saved tools %v", got)
	}
}

func TestAModelThatNeverStopsLookingIsCut(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"tool_calls":[{"id":"c","type":"function","function":{"name":"search_schema","arguments":"{\"query\":\"o\"}"}}]}}]}`))
	}))
	defer server.Close()
	svc := toolService(t, server.URL)
	preview, _ := svc.Preview(context.Background(), AIPreviewRequest{Message: "loop"})

	_, err := svc.Send(context.Background(), AISendRequest{Message: "loop", SendToken: preview.SendToken})
	if err == nil || !strings.Contains(err.Error(), "narrower question") {
		t.Fatalf("an endless lookup was not stopped: %v", err)
	}
}

func TestMentionedTableGoesInWithTheQuestion(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "count @orders", Mentions: []string{"orders"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(preview.Body, "customer_id int") || !strings.Contains(preview.Data, "table public.orders") {
		t.Fatalf("the mentioned table was not described up front: %s", preview.Body)
	}
	if strings.Contains(preview.Body, "table public.customers") {
		t.Fatalf("a table nobody mentioned was sent: %s", preview.Body)
	}
}
