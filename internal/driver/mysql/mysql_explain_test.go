// SPDX-License-Identifier: GPL-3.0-only

package mysql

import "testing"

func TestParseMySQLExplainJSONReadsTableAccess(t *testing.T) {
	raw := `{"query_block":{"select_id":1,"table":{"table_name":"customers","access_type":"ALL","rows_examined_per_scan":10}}}`
	plan, err := parseMySQLExplainJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.TablesTouched) != 1 || plan.TablesTouched[0].Table != "customers" || plan.TablesTouched[0].Access != "seq_scan" {
		t.Fatalf("%+v", plan)
	}
	if plan.EstRows != 10 {
		t.Fatalf("estRows=%d", plan.EstRows)
	}
}
