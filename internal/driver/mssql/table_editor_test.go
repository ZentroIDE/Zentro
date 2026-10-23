// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"strings"
	"testing"

	"zentro/internal/models"
)

func TestBuildCreateTableStatementsQuotesIdentifiers(t *testing.T) {
	d := New()
	statements := d.BuildCreateTableStatements("app", models.SchemaTableSnapshot{
		Name: "new table",
		Columns: []models.ColumnDef{
			{Name: "id", DataType: "int", IsNullable: false, IsPrimaryKey: true},
			{Name: "display name", DataType: "varchar(255)", IsNullable: true},
		},
	})

	joined := strings.Join(statements, "\n")
	expectedParts := []string{
		`CREATE TABLE "app"."new table" (`,
		`"id" int NOT NULL`,
		`"display name" varchar(255)`,
		`PRIMARY KEY ("id")`,
	}
	for _, part := range expectedParts {
		if !strings.Contains(joined, part) {
			t.Fatalf("expected statements to contain %q, got:\n%s", part, joined)
		}
	}
}
