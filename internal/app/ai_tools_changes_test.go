// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"zentro/internal/extensions/license"
)

const testExplanation = `{"summary":"Sets one id.","affected_objects":["t.id"],"expected_effect":"One row gets a new id.","risks":["Readers keyed on the old id lose the row."],"irreversible":false,"rollback_plan":"Run the opposite update."}`

// proposeArgs builds propose_change arguments that carry a valid explanation.
func proposeArgs(env, sql, extra string) string {
	raw, _ := json.Marshal(map[string]string{"env": env, "sql": sql})
	body := strings.TrimSuffix(string(raw), "}") + `,"explanation":` + testExplanation
	if extra != "" {
		body += "," + extra
	}
	return body + "}"
}

func enableChanges(t *testing.T, svc *AIService) {
	t.Helper()
	if _, err := svc.SetSettings(ProjectAISettings{Enabled: true, AllowChanges: true, AllowReadData: true}); err != nil {
		t.Fatal(err)
	}
}

func TestProposeChangeRefusesDenyList(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	out := svc.runTool(context.Background(), "propose_change", `{"env":"dev","sql":"GRANT SELECT ON t TO PUBLIC"}`, true)
	env := decodeEnvelope(t, out.Content)
	if env.OK || env.Error == nil || env.Error.Code != aiCodeSQLNotAllowed {
		t.Fatalf("grant was proposed: %s", out.Content)
	}
}

func TestProposeChangeCreatesPendingAndCancel(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	out := svc.runTool(context.Background(), "propose_change", proposeArgs("dev", "update t set id = 1 where id = 0", `"title":"fix"`), true)
	env := requireOK(t, out.Content)
	var data struct {
		ID    string `json:"id"`
		State string `json:"state"`
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.State != aiProposalPending {
		t.Fatalf("state %s", data.State)
	}
	cancel := svc.runTool(context.Background(), "cancel_change", `{"id":"`+data.ID+`"}`, true)
	requireOK(t, cancel.Content)
	again := svc.runTool(context.Background(), "cancel_change", `{"id":"`+data.ID+`"}`, true)
	denied := decodeEnvelope(t, again.Content)
	if denied.OK || denied.Error == nil || denied.Error.Code != aiCodeInvalidState {
		t.Fatalf("cancelled twice: %s", again.Content)
	}
}

func TestApproveChangeRunsOnSQLite(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	svc.canUse = func(license.FeatureID) bool { return false }
	out := svc.runTool(context.Background(), "propose_change", proposeArgs("dev", "insert into t(id) values (2)", ""), true)
	env := requireOK(t, out.Content)
	var data struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ApproveChange(context.Background(), AIChangeApproveRequest{ID: data.ID, Confirmation: "dev"}); err != nil {
		t.Fatal(err)
	}
}

func TestMigrationSafetyFlagsDropTable(t *testing.T) {
	out := analyzeMigrationSQL("DROP TABLE t", "", nil)
	if out.MaxSeverity != "critical" {
		t.Fatalf("severity %s", out.MaxSeverity)
	}
}

func TestProposalTTLClock(t *testing.T) {
	if proposalTTL("pro") != 5*time.Minute {
		t.Fatal(proposalTTL("pro"))
	}
}

func proposalFor(t *testing.T, svc *AIService, args string) AIChangeProposal {
	t.Helper()
	out := svc.runTool(context.Background(), "propose_change", args, true)
	env := requireOK(t, out.Content)
	var data struct{ ID string }
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatal(err)
	}
	prop, err := svc.GetChange(data.ID)
	if err != nil {
		t.Fatal(err)
	}
	return prop
}

func checkNamed(prop AIChangeProposal, name string) (AIProposalCheck, bool) {
	for _, check := range prop.Checks {
		if check.Name == name {
			return check, true
		}
	}
	return AIProposalCheck{}, false
}

func TestProposeChangeRequiresAnExplanation(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	cases := map[string]string{
		"missing":      `{"env":"dev","sql":"update t set id = 1 where id = 0"}`,
		"no risks":     `{"env":"dev","sql":"update t set id = 1 where id = 0","explanation":{"summary":"s","affected_objects":[],"expected_effect":"e","risks":[],"irreversible":false,"rollback_plan":"r"}}`,
		"blank effect": `{"env":"dev","sql":"update t set id = 1 where id = 0","explanation":{"summary":"s","affected_objects":[],"expected_effect":"  ","risks":["x"],"irreversible":false,"rollback_plan":"r"}}`,
		"no rollback":  `{"env":"dev","sql":"update t set id = 1 where id = 0","explanation":{"summary":"s","affected_objects":[],"expected_effect":"e","risks":["x"],"irreversible":false,"rollback_plan":""}}`,
		"no flag":      `{"env":"dev","sql":"update t set id = 1 where id = 0","explanation":{"summary":"s","affected_objects":[],"expected_effect":"e","risks":["x"],"rollback_plan":"r"}}`,
	}
	for name, args := range cases {
		out := svc.runTool(context.Background(), "propose_change", args, true)
		env := decodeEnvelope(t, out.Content)
		if env.OK || env.Error == nil || env.Error.Code != aiCodeInvalidArgument {
			t.Fatalf("%s: a proposal without a full explanation was accepted: %s", name, out.Content)
		}
	}
	list := svc.runTool(context.Background(), "list_changes", `{}`, true)
	var items []aiChangeListItemDTO
	if err := json.Unmarshal(requireOK(t, list.Content).Data, &items); err != nil || len(items) != 0 {
		t.Fatalf("a refused proposal was stored: %+v err %v", items, err)
	}
}

func TestProposeChangeRefusesAnExplanationThatHoldsAValue(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	args := `{"env":"dev","sql":"update t set id = 1 where id = 0","explanation":{"summary":"Fixes the row for alice@example.com.","affected_objects":["t"],"expected_effect":"e","risks":["x"],"irreversible":false,"rollback_plan":"r"}}`
	out := svc.runTool(context.Background(), "propose_change", args, true)
	if env := decodeEnvelope(t, out.Content); env.OK {
		t.Fatalf("an explanation with an email was accepted: %s", out.Content)
	}
}

func TestProposalStoresTheExplanationAndTheSystemChecksApart(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	prop := proposalFor(t, svc, proposeArgs("dev", "update t set id = 1 where id = 0", ""))
	if prop.Explanation == nil || prop.Explanation.Summary != "Sets one id." || len(prop.Explanation.Risks) != 1 {
		t.Fatalf("explanation not stored: %+v", prop.Explanation)
	}
	where, ok := checkNamed(prop, "where_clause")
	if !ok || where.Status != aiCheckOK {
		t.Fatalf("where check %+v ok=%v", where, ok)
	}
	rows, ok := checkNamed(prop, "row_count")
	if !ok || rows.Status == "" || rows.Detail == "" {
		t.Fatalf("row count check %+v ok=%v", rows, ok)
	}
}

func TestSystemChecksDoNotTrustTheAgentsOwnClaim(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	// The agent says nothing is wrong; the SQL has no WHERE. Zentro warns anyway.
	prop := proposalFor(t, svc, proposeArgs("dev", "delete from t", ""))
	where, ok := checkNamed(prop, "where_clause")
	if !ok || where.Status != aiCheckWarn {
		t.Fatalf("a DELETE with no WHERE was not flagged: %+v ok=%v", where, ok)
	}
	if prop.Explanation == nil || prop.Explanation.Irreversible {
		t.Fatal("the test needs an agent that claims it is reversible")
	}
	if _, ok := checkNamed(prop, "cascade"); !ok {
		t.Fatal("a DELETE has no cascade check, not even an unavailable one")
	}
}

func TestDropIsFlaggedDestructiveAndGetsAMigrationCheck(t *testing.T) {
	svc, _ := envResolverFixture(t)
	enableChanges(t, svc)
	prop := proposalFor(t, svc, proposeArgs("dev", "drop table t", ""))
	destructive, ok := checkNamed(prop, "destructive")
	if !ok || destructive.Status != aiCheckWarn {
		t.Fatalf("a DROP was not flagged: %+v ok=%v", destructive, ok)
	}
	if _, ok := checkNamed(prop, "migration_safety"); !ok {
		t.Fatal("DDL has no migration check")
	}
}
