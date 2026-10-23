// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"zentro/internal/extensions/license"
	"zentro/internal/extensions/querystat"
)

const (
	leakStatement = "select ssn from payroll where id = 42"
	leakError     = "duplicate key value (ssn)=(123-45-6789)"
	leakReason    = "fixing the payroll bug for Dana"
	leakRepo      = `D:\work\shop\.git`
	leakAuthor    = "dana@example.com"
)

func activityService(t *testing.T) *AIService {
	t.Helper()
	svc := contextService(t)
	svc.source.audit = func(int) ([]SQLAuditEntry, error) {
		return []SQLAuditEntry{
			{ID: "1", ExecutedAt: "2026-10-01T10:00:00Z", StatementText: leakStatement, Profile: "Shop DB", Database: "shop", Driver: "postgres", EnvKey: "dev", DurationMs: 12, RowCount: 3, IsSelect: true, RiskLevel: "low"},
			{ID: "2", ExecutedAt: "2026-10-01T11:00:00Z", StatementText: leakStatement, Profile: "Shop DB", Database: "shop", Driver: "postgres", EnvKey: "pro", RiskLevel: "high", Reason: leakReason, Error: leakError, UsedProtectionLayers: []string{"type_to_confirm"}},
		}, nil
	}
	svc.source.gitStatus = func() (GitTrackingStatus, error) {
		return GitTrackingStatus{Enabled: true, Initialized: true, RepoPath: leakRepo, LastCommitHash: "0123456789abcdef", PendingCount: 2, LastError: leakRepo}, nil
	}
	svc.source.gitTimeline = func(int) ([]GitTimelineItem, error) {
		return []GitTimelineItem{{Hash: "0123456789abcdef", Message: "Update script month end", EventType: "script", Author: leakAuthor, When: "2026-10-01T09:00:00Z", Files: []string{leakRepo + `\a.sql`, "b.sql"}}}, nil
	}
	svc.source.queryStats = func(window, limit int) querystat.StatReport {
		return querystat.StatReport{
			TotalExecs: 40, ErrorRate: 0.05, AvgDurationMs: 8, P95DurationMs: 40, WindowMins: window,
			TopImpact: []querystat.QueryPattern{{NormalizedSQL: "select id from orders where status = ?", ExecCount: 30, TotalMs: 900, AvgMs: 30, P95Ms: 80}},
		}
	}
	return svc
}

func TestListAuditGivesTheRunsButNotTheWords(t *testing.T) {
	out := runContextTool(t, activityService(t), "list_audit", `{}`)
	var data []aiAuditDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 2 {
		t.Fatalf("history %+v", data)
	}
	var pro *aiAuditDTO
	for i := range data {
		if data[i].Environment == "pro" {
			pro = &data[i]
		}
	}
	if pro == nil || pro.RiskLevel != "high" || !pro.Failed || len(pro.Protections) != 1 || pro.Protections[0] != "type_to_confirm" {
		t.Fatalf("the pro run is wrong: %+v", data)
	}
	for _, secret := range []string{leakStatement, leakError, leakReason} {
		if strings.Contains(out.Content, secret) {
			t.Fatalf("list_audit returned %q:\n%s", secret, out.Content)
		}
	}
}

func TestListAuditFiltersByEnvironmentAndFailure(t *testing.T) {
	svc := activityService(t)
	pro := runContextTool(t, svc, "list_audit", `{"environment":"pro"}`)
	var proData []aiAuditDTO
	if err := json.Unmarshal(requireOK(t, pro.Content).Data, &proData); err != nil {
		t.Fatal(err)
	}
	for _, entry := range proData {
		if entry.Environment == "dev" {
			t.Fatalf("a dev run came back for pro:\n%s", pro.Content)
		}
	}
	failed := runContextTool(t, svc, "list_audit", `{"failedOnly":true}`)
	var failedData []aiAuditDTO
	if err := json.Unmarshal(requireOK(t, failed.Content).Data, &failedData); err != nil {
		t.Fatal(err)
	}
	for _, entry := range failedData {
		if !entry.Failed {
			t.Fatalf("a run that worked came back as failed:\n%s", failed.Content)
		}
	}
}

func TestGetGitStatusHasNoPathAuthorOrContent(t *testing.T) {
	out := runContextTool(t, activityService(t), "get_git_status", `{}`)
	var data aiGitDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.PendingChanges != 2 || len(data.Recent) != 1 || data.Recent[0].Files != 2 || data.Recent[0].Message != "Update script month end" {
		t.Fatalf("the git status is wrong: %+v", data)
	}
	for _, secret := range []string{leakRepo, leakAuthor, "0123456789abcdef", "01234567"} {
		if strings.Contains(out.Content, secret) {
			t.Fatalf("get_git_status returned %q:\n%s", secret, out.Content)
		}
	}
}

func TestGetQueryStatsShowsShapesWithoutValues(t *testing.T) {
	out := runContextTool(t, activityService(t), "get_query_stats", `{"windowMinutes":60}`)
	var data aiQueryStatsDTO
	if err := json.Unmarshal(requireOK(t, out.Content).Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.WindowMins != 60 || len(data.TopByImpact) != 1 || data.TopByImpact[0].Pattern != "select id from orders where status = ?" {
		t.Fatalf("the statistics are wrong:\n%s", out.Content)
	}
}

// The assistant is free on every plan (ADR 0019), so these tools are offered
// and run whatever the plan says, and when there is no license check at all.
func TestActivityToolsAreFreeOnEveryPlan(t *testing.T) {
	plans := map[string]func(license.FeatureID) bool{
		"free plan":        func(license.FeatureID) bool { return false },
		"no license check": nil,
	}
	for name, canUse := range plans {
		t.Run(name, func(t *testing.T) {
			svc := activityService(t)
			svc.canUse = canUse
			names := strings.Join(toolNames(svc.toolsFor()), ",")
			for _, tool := range []string{"list_audit", "get_git_status", "get_query_stats"} {
				if !strings.Contains(names, tool) {
					t.Fatalf("%s was not offered: %s", tool, names)
				}
				if out := svc.runTool(context.Background(), tool, `{}`, false); out.Failed || out.Withheld {
					t.Fatalf("%s did not run: %+v", tool, out)
				}
			}
		})
	}
}
