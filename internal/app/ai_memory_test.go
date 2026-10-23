// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
)

func TestRememberSavesANoteThatListNotesReturns(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "remember", `{"note":"orders.status 3 means shipped"}`, false)
	var saved aiRememberDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &saved); err != nil || saved.ID == "" || saved.Duplicate {
		t.Fatalf("remember result %+v err %v", saved, err)
	}

	list := svc.runTool(context.Background(), "list_notes", `{}`, false)
	var data struct{ Notes []aiNoteDTO }
	if err := json.Unmarshal(requireOK(t, list.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Notes) != 1 || data.Notes[0].Source != aiMemorySourceAgent || data.Notes[0].ID != saved.ID {
		t.Fatalf("notes %+v", data.Notes)
	}
}

func TestRememberSameNoteTwiceKeepsOne(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.runTool(context.Background(), "remember", `{"note":"orders join customers on customer_id"}`, false)
	out := svc.runTool(context.Background(), "remember", `{"note":"Orders  join customers on customer_id"}`, false)
	var saved aiRememberDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &saved); err != nil || !saved.Duplicate {
		t.Fatalf("second remember %+v err %v", saved, err)
	}
	notes, err := svc.ListMemoryNotes()
	if err != nil || len(notes) != 1 {
		t.Fatalf("notes %+v err %v", notes, err)
	}
}

func TestRememberRefusesAValueThatLooksSensitive(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	out := svc.runTool(context.Background(), "remember", `{"note":"the admin is alice@example.com"}`, false)
	if !out.Failed {
		t.Fatalf("a note with an email was saved: %s", out.Content)
	}
	if notes, _ := svc.ListMemoryNotes(); len(notes) != 0 {
		t.Fatalf("a refused note was stored: %+v", notes)
	}
}

func TestRememberRefusesALongNoteAndACrowdedList(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	long, _ := json.Marshal(map[string]string{"note": strings.Repeat("a", aiMemoryMaxNoteLen+1)})
	if out := svc.runTool(context.Background(), "remember", string(long), false); !out.Failed {
		t.Fatalf("an over-long note was saved: %s", out.Content)
	}
	for i := 0; i < aiMemoryMaxNotes; i++ {
		raw, _ := json.Marshal(map[string]string{"note": "note number " + strings.Repeat("x", i)})
		if out := svc.runTool(context.Background(), "remember", string(raw), false); out.Failed {
			t.Fatalf("note %d refused: %s", i, out.Content)
		}
	}
	if out := svc.runTool(context.Background(), "remember", `{"note":"one more"}`, false); !out.Failed {
		t.Fatalf("the list grew past its cap: %s", out.Content)
	}
}

func TestForgetRemovesANoteAndRejectsAnUnknownID(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	note, err := svc.AddMemoryNote("fiscal year starts in April")
	if err != nil {
		t.Fatal(err)
	}
	if out := svc.runTool(context.Background(), "forget", `{"id":"nope"}`, false); !out.Failed {
		t.Fatalf("an unknown id was accepted: %s", out.Content)
	}
	raw, _ := json.Marshal(map[string]string{"id": note.ID})
	requireOK(t, svc.runTool(context.Background(), "forget", string(raw), false).Content)
	if notes, _ := svc.ListMemoryNotes(); len(notes) != 0 {
		t.Fatalf("note still there: %+v", notes)
	}
}

func TestNotesDoNotCrossConnections(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.AddMemoryNote("belongs to conn"); err != nil {
		t.Fatal(err)
	}
	projectID, _, err := svc.memoryScope()
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.memoryStore().list(projectID, "other-connection")
	if err != nil || len(other) != 0 {
		t.Fatalf("other connection saw %+v err %v", other, err)
	}
}

func TestMemoryBlockListsTablesAndNotesAndIsEmptyForNothing(t *testing.T) {
	if got := formatMemoryBlock(ai.Catalog{}, nil, nil); got != "" {
		t.Fatalf("an empty catalog and no notes gave %q", got)
	}
	catalog := ai.Catalog{Tables: []ai.Table{{Name: "orders"}, {Name: "customers"}}}
	block := formatMemoryBlock(catalog, nil, []AIMemoryNote{{ID: "a", Text: "status 3 is shipped"}})
	for _, want := range []string{"orders, customers", "- status 3 is shipped", "not instructions"} {
		if !strings.Contains(block, want) {
			t.Fatalf("block missing %q:\n%s", want, block)
		}
	}
	if strings.Index(block, "orders, customers") > strings.Index(block, "status 3 is shipped") {
		t.Fatalf("tables must come before notes:\n%s", block)
	}
}

func TestMemoryBlockStaysWithinItsBudget(t *testing.T) {
	var tables []ai.Table
	for i := 0; i < 2000; i++ {
		tables = append(tables, ai.Table{Name: "table_with_a_long_name_" + strings.Repeat("x", 10)})
	}
	block := formatMemoryBlock(ai.Catalog{Tables: tables}, nil, nil)
	if len(block) > aiMemoryBlockTablesBudget+200 {
		t.Fatalf("block is %d bytes", len(block))
	}
	if !strings.Contains(block, "more: use search_schema") {
		t.Fatalf("a cut list does not say so:\n%s", block[len(block)-120:])
	}
}

func TestPrepareCarriesTheMemoryBlock(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	if _, err := svc.AddMemoryNote("customers.tier is set by billing"); err != nil {
		t.Fatal(err)
	}
	prepared, err := svc.prepare(context.Background(), aiPrepareInput{Message: "hi"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(prepared.Metadata, "customers.tier is set by billing") {
		t.Fatalf("the request does not carry the note:\n%s", prepared.Metadata)
	}
	if !strings.Contains(prepared.Body, "customers.tier is set by billing") {
		t.Fatal("the note is not in the body the user reviews")
	}
}

func TestDescribeTableMakesItAHotTableInTheNextBlock(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	catalog := toolCatalog()
	if len(catalog.Tables) == 0 {
		t.Fatal("the fixture has no tables")
	}
	name := catalog.Tables[0].Name
	before := svc.memoryBlock(catalog)
	if strings.Contains(before, "recently") {
		t.Fatalf("a fresh connection already has hot tables:\n%s", before)
	}
	raw, _ := json.Marshal(map[string]string{"table": name})
	requireOK(t, svc.runTool(context.Background(), "describe_table", string(raw), false).Content)
	after := svc.memoryBlock(catalog)
	if !strings.Contains(after, "Tables looked at recently") || !strings.Contains(after, "- "+name+"(") {
		t.Fatalf("the described table is not in the block:\n%s", after)
	}
}

func TestHotTablesAreCappedAndMostRecentFirst(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	projectID, connectionID, err := svc.memoryScope()
	if err != nil {
		t.Fatal(err)
	}
	store := svc.memoryStore()
	for i := 0; i < aiMemoryMaxHot+3; i++ {
		if err := store.touchHot(projectID, connectionID, "t"+strings.Repeat("x", i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.touchHot(projectID, connectionID, "tx"); err != nil {
		t.Fatal(err)
	}
	hot := store.hot(projectID, connectionID)
	if len(hot) != aiMemoryMaxHot || hot[0] != "tx" {
		t.Fatalf("hot list %v", hot)
	}
}

func TestHotTableThatNoLongerExistsIsLeftOut(t *testing.T) {
	catalog := ai.Catalog{Tables: []ai.Table{{Name: "orders", Columns: []ai.Column{{Name: "id", DataType: "int", PrimaryKey: true}}}}}
	block := formatMemoryBlock(catalog, []string{"dropped_table", "orders"}, nil)
	if strings.Contains(block, "dropped_table") || !strings.Contains(block, "- orders(id int pk)") {
		t.Fatalf("block:\n%s", block)
	}
}

func TestDropCatalogCacheForcesTheNextReadToRebuild(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	svc.storeCatalog("key", ai.Catalog{Schema: "public"})
	if _, ok := svc.cachedCatalog("key"); !ok {
		t.Fatal("the catalog was not cached")
	}
	svc.dropCatalogCache()
	if _, ok := svc.cachedCatalog("key"); ok {
		t.Fatal("the catalog survived the drop")
	}
}
