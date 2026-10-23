// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
)

func TestChatResultsCarryACompactMeta(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: "search_schema", Arguments: `{"query":"customer"}`}, false)
	requireOK(t, out.Content)
	// The open environment is not repeated, and the trust marker stays.
	if !strings.Contains(out.Content, `"meta":{"label":"data"}`) {
		t.Fatalf("the chat meta is not compact: %s", out.Content)
	}

	external := svc.runTool(context.Background(), "search_schema", `{"query":"customer"}`, false)
	if !strings.Contains(external.Content, `"elapsedMs"`) {
		t.Fatalf("an external agent lost the full meta: %s", external.Content)
	}
}

func TestCompactMetaNamesAnotherEnvironment(t *testing.T) {
	open := aiMeta{Env: "dev", Driver: "postgres", Database: "app", Schema: "public", Label: "data"}
	same := compactMeta(open, open)
	if same.Env != "" || same.Database != "" {
		t.Fatalf("the open environment was repeated: %+v", same)
	}
	other := open
	other.Env = "sta"
	if got := compactMeta(other, open); got.Env != "sta" || got.Database != "app" {
		t.Fatalf("another environment was not named: %+v", got)
	}
}

// The instructions ask for :name placeholders, so the check tools must take
// them; a refusal used to cost a whole extra round.
func TestCheckToolsAcceptNamedPlaceholders(t *testing.T) {
	svc := readDataFixture(t)
	out := svc.runTool(context.Background(), "validate_sql", `{"env":"dev","sql":"SELECT id FROM users WHERE status = :status"}`, false)
	var data aiValidateSQLDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if !data.Valid {
		t.Fatalf("a :name placeholder was rejected: %s", out.Content)
	}

	plan := svc.runTool(context.Background(), "explain_plan", `{"env":"dev","sql":"SELECT id FROM users WHERE status = :status"}`, false)
	env := requireOK(t, plan.Content)
	if !strings.Contains(strings.Join(env.Warnings, " "), "replaced by NULL") {
		t.Fatalf("the plan does not say placeholders were replaced: %s", plan.Content)
	}
}

func TestAReplyCanSaveNotesWithoutAToolRound(t *testing.T) {
	var captured string
	server := chatServer(t, &captured, "Use orders.ship_country.\n<remember>[\"orders.ship_country is the delivery country\", \"admin is bob@example.com\"]</remember>\n<suggestions>[\"next\"]</suggestions>")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, err := svc.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "where do orders ship?", SessionID: session.ID})
	if err != nil {
		t.Fatal(err)
	}
	sent, err := svc.Send(context.Background(), AISendRequest{Message: "where do orders ship?", SessionID: session.ID, SendToken: preview.SendToken})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sent.Reply, "remember") || len(sent.Suggestions) != 1 {
		t.Fatalf("the tag leaked into the reply: %+v", sent)
	}
	notes, err := svc.ListMemoryNotes()
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 || notes[0].Text != "orders.ship_country is the delivery country" || notes[0].Source != aiMemorySourceAgent {
		t.Fatalf("notes %+v (the email one must be refused)", notes)
	}
}

func specNames(specs []ai.ToolSpec) map[string]bool {
	out := map[string]bool{}
	for _, spec := range specs {
		out[spec.Name] = true
	}
	return out
}

func TestChatOffersACoreAndLoadsPacksOnDemand(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	settings := ProjectAISettings{Enabled: true}
	names := specNames(svc.toolSpecs(settings))
	for _, want := range []string{"search_schema", "describe_table", "list_relations", "validate_sql", aiMoreToolsName, aiUseToolName} {
		if !names[want] {
			t.Fatalf("%s is not offered: %v", want, names)
		}
	}
	for _, packed := range []string{"explain_plan", "get_app_context", "diff_schema", "classify_sql"} {
		if names[packed] {
			t.Fatalf("pack tool %s was offered up front", packed)
		}
	}

	loaded := svc.chatToolCall(context.Background(), ai.ToolCall{Name: aiMoreToolsName, Arguments: `{"pack":"performance"}`}, false)
	var pack aiPackDTO
	if err := json.Unmarshal(requireOK(t, loaded.Content).Data, &pack); err != nil {
		t.Fatal(err)
	}
	if len(pack.Tools) != 3 || pack.Tools[0].Name != "explain_plan" {
		t.Fatalf("performance pack %+v", pack)
	}

	used := svc.chatToolCall(context.Background(), ai.ToolCall{Name: aiUseToolName, Arguments: `{"name":"get_table_stats","arguments":{"table":"orders"}}`}, false)
	if used.Name != "get_table_stats" {
		t.Fatalf("use_tool did not run the pack tool: %+v", used)
	}
}

func TestUseToolKeepsTheGateAndRefusesWhatIsNotAPackTool(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	blocked := svc.chatToolCall(context.Background(), ai.ToolCall{Name: aiUseToolName, Arguments: `{"name":"dry_run","arguments":{"env":"dev","sql":"delete from t"}}`}, false)
	if env := decodeEnvelope(t, blocked.Content); env.OK || !strings.Contains(env.Error.Message, "reading data is off") {
		t.Fatalf("use_tool skipped the permission gate: %s", blocked.Content)
	}
	for _, name := range []string{"search_schema", "remember", aiUseToolName, "nope"} {
		args, _ := json.Marshal(map[string]any{"name": name, "arguments": map[string]string{}})
		out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: aiUseToolName, Arguments: string(args)}, false)
		if env := decodeEnvelope(t, out.Content); env.OK {
			t.Fatalf("use_tool ran %s: %s", name, out.Content)
		}
	}
	if out := svc.chatToolCall(context.Background(), ai.ToolCall{Name: aiMoreToolsName, Arguments: `{"pack":"nope"}`}, false); !out.Failed {
		t.Fatalf("an unknown pack loaded: %s", out.Content)
	}
}

func TestExternalAgentsStillSeeEveryTool(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	names := map[string]bool{}
	for _, tool := range svc.mcpTools() {
		names[tool.spec.Name] = true
	}
	if !names["explain_plan"] || !names["remember"] || names[aiMoreToolsName] {
		t.Fatalf("MCP list changed: %v", names)
	}
}

func TestCoreToolListIsMuchSmaller(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	raw, _ := json.Marshal(svc.toolSpecs(ProjectAISettings{Enabled: true}))
	if len(raw) > 7000 {
		t.Fatalf("the default chat tool list is %d bytes", len(raw))
	}
	t.Logf("default chat tool list: %d bytes", len(raw))
}

// Two questions in one chat must start with the same bytes, even when the
// first one described a table and saved a note, so the provider can bill the
// second at its cache rate. What was learned rides on the newest question.
func TestAChatKeepsItsPrefixAndSendsWhatIsNewWithTheQuestion(t *testing.T) {
	var captured string
	server := chatServer(t, &captured, "Done.")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, err := svc.CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	ask := func(message string) aiPrepared {
		t.Helper()
		preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: message, SessionID: session.ID})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Send(context.Background(), AISendRequest{Message: message, SessionID: session.ID, SendToken: preview.SendToken}); err != nil {
			t.Fatal(err)
		}
		prepared, err := svc.prepare(context.Background(), aiPrepareInput{Message: "probe", SessionID: session.ID})
		if err != nil {
			t.Fatal(err)
		}
		return prepared
	}
	first := ask("first question")
	if _, err := svc.AddMemoryNote("orders.status 3 means shipped"); err != nil {
		t.Fatal(err)
	}
	svc.recordHotTable(tables[0].Name)
	second := ask("second question")

	if first.Metadata != second.Metadata {
		t.Fatal("the system message changed between two questions of one chat")
	}
	if strings.Contains(second.Metadata, "status 3 means shipped") {
		t.Fatal("a new note went into the frozen block")
	}
	if !strings.Contains(second.Turn.UserText, "Context added in this chat") || !strings.Contains(second.Turn.UserText, "status 3 means shipped") {
		t.Fatalf("the new note did not ride on the question: %q", second.Turn.UserText)
	}
}

func longTurns(n int) []AISessionTurn {
	var turns []AISessionTurn
	for i := 0; i < n; i++ {
		turns = append(turns,
			AISessionTurn{Role: "user", Text: "question " + strings.Repeat("q", 50)},
			AISessionTurn{Role: "assistant", Text: "Answer first. " + strings.Repeat("a", 3000), SQL: "select 1"},
		)
	}
	return turns
}

func TestHistoryFoldsAtACheckpointAndStaysStable(t *testing.T) {
	session := AISession{Turns: longTurns(4)}
	history, summary, through, folded := foldHistory(session)
	if folded || summary != "" || len(history) != 8 {
		t.Fatalf("a short chat was folded: %d turns, folded=%v", len(history), folded)
	}

	session.Turns = longTurns(10)
	history, summary, through, folded = foldHistory(session)
	if !folded || through == 0 || len(history) != aiHistoryKeepTurns || history[0].Role != "user" {
		t.Fatalf("fold: through=%d kept=%d first=%s", through, len(history), history[0].Role)
	}
	if !strings.Contains(summary, "Q: question") || !strings.Contains(summary, "A: Answer first.") || !strings.Contains(summary, "SQL: select 1") {
		t.Fatalf("summary %q", summary)
	}

	// The next question replays the same folded history until the next fold.
	session.Summary, session.SummaryThrough = summary, through
	session.Turns = append(session.Turns, AISessionTurn{Role: "user", Text: "next"}, AISessionTurn{Role: "assistant", Text: "ok"})
	again, summary2, through2, folded2 := foldHistory(session)
	if folded2 || summary2 != summary || through2 != through {
		t.Fatal("the summary changed without a new fold")
	}
	for i := range history {
		if again[i] != history[i] {
			t.Fatal("the replayed history changed between questions")
		}
	}
}

// A hold must tell the person what was found and where, not only a masked
// sample, so they can tell an amount from a phone number.
func TestAHoldSaysWhereTheMatchIsAndShowsIt(t *testing.T) {
	server := chatServer(t, nil, "ok")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	preview, err := svc.Preview(context.Background(), AIPreviewRequest{Message: "orders by bob@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if !preview.Held || len(preview.Matches) != 1 {
		t.Fatalf("preview %+v", preview)
	}
	match := preview.Matches[0]
	if match.Where != "your message" || !strings.Contains(match.Context, "orders by bob@example.com") {
		t.Fatalf("match %+v", match)
	}
}

func TestAutoApproveSendsWithoutAReviewButStillHoldsSensitiveText(t *testing.T) {
	server := chatServer(t, nil, "ok")
	defer server.Close()
	tables := defaultTables()
	svc := newReviewService(t, server.URL, &tables)
	session, _ := svc.CreateSession()
	if _, err := svc.Send(context.Background(), AISendRequest{Message: "count orders", SessionID: session.ID}); err == nil {
		t.Fatal("a send went through without review while auto-approve was off")
	}
	settings, _, _ := svc.readSettings()
	settings.AutoApprove = true
	if _, err := svc.SetSettings(settings); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Send(context.Background(), AISendRequest{Message: "count orders", SessionID: session.ID}); err != nil {
		t.Fatalf("auto-approve did not send: %v", err)
	}
	held, err := svc.Send(context.Background(), AISendRequest{Message: "orders of bob@example.com", SessionID: session.ID})
	if err != nil || !held.Held {
		t.Fatalf("auto-approve skipped the sensitive hold: %+v %v", held, err)
	}
}

// Text from earlier turns already went to the provider, so it must not hold
// every later question on the same match.
func TestEarlierTurnsDoNotHoldANewQuestion(t *testing.T) {
	prepared := aiPrepared{Turn: ai.Turn{
		UserText: "top suppliers",
		History:  []ai.Message{{Role: "assistant", Content: "contact bob@example.com for access"}},
	}}
	if matches := scanRequest("top suppliers", prepared); len(matches) != 0 {
		t.Fatalf("an earlier reply held a new question: %+v", matches)
	}
	if matches := scanRequest("mail bob@example.com", prepared); len(matches) != 1 || matches[0].Where != "your message" {
		t.Fatalf("a new match was missed: %+v", matches)
	}
}
