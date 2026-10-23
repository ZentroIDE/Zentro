// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/extensions/license"
	"zentro/internal/extensions/querystat"
)

// The assistant reads the collected statistics on every plan, through the
// ungated reader and its own context source.
func TestQueryStatsReportIsAvailableOnFreePlan(t *testing.T) {
	useTempQueryPreflightConfigDir(t)

	stats := querystat.New()
	stats.Observe(querystat.ExecutionEvent{
		IsSelect: true, DurationMs: 12, RowCount: 3,
		StatementText: "SELECT id FROM orders WHERE status = 'open'",
	})
	free := &App{svc: Services{License: license.NewLocalEntitlements()}}
	free.svc.RegisterExtension(stats)
	free.eval = NewEntitlementEvaluator(NewLicenseChecker(func() license.Entitlements { return free.svc.License }))

	if got := free.queryStatsReport(querystat.StatFilter{}).TotalExecs; got != 1 {
		t.Errorf("the assistant's report saw %d runs on the free plan, want 1", got)
	}
	if got := free.newAIContextSource().queryStats(0, 5).TotalExecs; got != 1 {
		t.Errorf("the assistant's context source saw %d runs on the free plan, want 1", got)
	}
}
