// SPDX-License-Identifier: GPL-3.0-only

package sqlite

import (
	"strings"
	"testing"

	"zentro/internal/models"
)

func TestBuildCreateTableStatementsQuotesIdentifiers(t *testing.T) {
	d := New()
	statements := d.BuildCreateTableStatements("main", models.SchemaTableSnapshot{
		Name: "new table",
		Columns: []models.ColumnDef{
			{Name: "id", DataType: "integer", IsNullable: false, IsPrimaryKey: true},
			{Name: "display name", DataType: "text", IsNullable: true},
		},
	})

	joined := strings.Join(statements, "\n")
	expectedParts := []string{
		`CREATE TABLE "main"."new table" (`,
		`"id" integer NOT NULL`,
		`"display name" text`,
		`PRIMARY KEY ("id")`,
	}
	for _, part := range expectedParts {
		if !strings.Contains(joined, part) {
			t.Fatalf("expected statements to contain %q, got:\n%s", part, joined)
		}
	}
}
