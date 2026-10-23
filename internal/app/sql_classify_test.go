// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/utils"
)

func classifyIn(t *testing.T, sql, env string) sqlClassification {
	t.Helper()
	return classifyForEnv(sql, "postgres", resolveExecutionPolicy(utils.Preferences{}, env))
}

func hasRule(c sqlClassification, rule string) bool {
	for _, r := range c.Reasons {
		if r.Rule == rule {
			return true
		}
	}
	return false
}

func hasSuggestion(c sqlClassification, kind string) bool {
	for _, s := range c.Suggestions {
		if s.Kind == kind {
			return true
		}
	}
	return false
}

func TestClassifyForEnvVerdicts(t *testing.T) {
	cases := []struct {
		name, sql, env, verdict, rule string
	}{
		{"read is allowed everywhere", "select id from orders where id = $1", "pro", classifyAllowed, ""},
		{"a scoped delete is allowed in dev", "delete from orders where id = 1", "dev", classifyAllowed, ""},
		{"the same delete needs confirmation in pro", "delete from orders where id = 1", "pro", classifyNeedsConfirmation, "production_write"},
		{"delete without where in balanced dev", "delete from orders", "dev", classifyNeedsConfirmation, "delete_without_where"},
		{"delete without where in strict staging", "delete from orders", "sta", classifyBlocked, "delete_without_where"},
		{"update without where in strict pro", "update orders set status = 'x'", "pro", classifyBlocked, "update_without_where"},
		{"a WHERE inside a CTE does not count", "with x as (select 1 where true) delete from orders", "dev", classifyNeedsConfirmation, "delete_without_where"},
		{"a WHERE inside a subquery does not count", "update orders set status = (select s from t where id = 1)", "dev", classifyNeedsConfirmation, "update_without_where"},
		{"a write hidden in a CTE is a write", "with d as (delete from a returning 1) select * from d", "dev", classifyNeedsConfirmation, "delete_without_where"},
		{"drop always needs confirmation", "drop table orders", "dev", classifyNeedsConfirmation, "ddl_drop"},
		{"truncate always needs confirmation", "truncate orders", "dev", classifyNeedsConfirmation, "truncate"},
		{"create in pro", "create table t (id int)", "pro", classifyNeedsConfirmation, "ddl_in_production"},
		{"create in dev", "create table t (id int)", "dev", classifyAllowed, ""},
		{"DO is unanalyzable", "do $$ begin delete from orders; end $$", "dev", classifyNeedsConfirmation, "unanalyzable_statement"},
		{"EXECUTE is unanalyzable", "execute my_plan(1)", "dev", classifyNeedsConfirmation, "unanalyzable_statement"},
		{"U& is unanalyzable", `select U&"\0061" from t`, "dev", classifyNeedsConfirmation, "unanalyzable_statement"},
		{"several writes in strict staging", "insert into a values (1); insert into b values (2)", "sta", classifyNeedsConfirmation, "multi_statement"},
		{"FOR UPDATE is not a write", "select * from orders where id = 1 for update", "pro", classifyAllowed, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyIn(t, tc.sql, tc.env)
			if got.Verdict != tc.verdict {
				t.Fatalf("verdict = %s, want %s (reasons %+v)", got.Verdict, tc.verdict, got.Reasons)
			}
			if tc.rule != "" && !hasRule(got, tc.rule) {
				t.Fatalf("missing rule %s in %+v", tc.rule, got.Reasons)
			}
		})
	}
}

func TestClassifyForEnvNeverAllowsAnUnanalyzableStatement(t *testing.T) {
	for _, env := range []string{"dev", "sta", "pro"} {
		for _, sql := range []string{"do $$ begin end $$", "execute p", `select U&'\0061'`, "vacuum orders"} {
			if got := classifyIn(t, sql, env); got.Verdict == classifyAllowed {
				t.Fatalf("%s in %s was allowed: %+v", sql, env, got)
			}
		}
	}
}

func TestClassifyForEnvSuggestions(t *testing.T) {
	if got := classifyIn(t, "select * from orders", "dev"); !hasSuggestion(got, "add_limit") {
		t.Fatalf("no add_limit: %+v", got.Suggestions)
	}
	if got := classifyIn(t, "select * from orders limit 10", "dev"); hasSuggestion(got, "add_limit") {
		t.Fatalf("add_limit despite a LIMIT: %+v", got.Suggestions)
	}
	got := classifyIn(t, "delete from orders; delete from items", "dev")
	for _, kind := range []string{"add_where", "wrap_in_transaction", "use_propose_change"} {
		if !hasSuggestion(got, kind) {
			t.Fatalf("missing %s: %+v", kind, got.Suggestions)
		}
	}
}
