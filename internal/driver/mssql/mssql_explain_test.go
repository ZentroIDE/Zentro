// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"testing"
)

func TestParseShowplanXMLReadsTableScan(t *testing.T) {
	raw := `<?xml version="1.0"?><ShowPlanXML><RelOp PhysicalOp="Table Scan" EstimateRows="5"><Object Table="[customers]" /></RelOp></ShowPlanXML>`
	plan, err := parseShowplanXML(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.TablesTouched) != 1 || plan.TablesTouched[0].Table != "customers" {
		t.Fatalf("%+v", plan)
	}
}

func TestValidateStatementIsTokenOnly(t *testing.T) {
	d := New()
	got, err := d.ValidateStatement(context.Background(), nil, "dbo", "SELECT 1 FROM t")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Valid || got.CheckedBy != "tokens" {
		t.Fatalf("%+v", got)
	}
}
