// SPDX-License-Identifier: GPL-3.0-only

package querystat

import "testing"

func TestObserve_SkipsInternalSQL(t *testing.T) {
	svc := New()

	svc.Observe(ExecutionEvent{
		StatementText: `SELECT * FROM "app"."orders" /* zentro:schema-rev:0 */`,
		IsSelect:      true,
	})
	svc.Observe(ExecutionEvent{
		StatementText: "SELECT * FROM orders",
		IsSelect:      true,
	})

	report := svc.GetReport(StatFilter{})
	if report.TotalExecs != 1 {
		t.Fatalf("expected 1 execution, got %d", report.TotalExecs)
	}
	if len(report.TopFrequent) != 1 {
		t.Fatalf("expected 1 pattern, got %d", len(report.TopFrequent))
	}
}
