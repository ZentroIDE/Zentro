// SPDX-License-Identifier: GPL-3.0-only

package postgres

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
			{
				Name:         "id",
				DataType:     "integer",
				IsNullable:   false,
				IsPrimaryKey: true,
				DefaultValue: `nextval('app."new table_id_seq"'::regclass)`,
			},
			{
				Name:       "display name",
				DataType:   "character varying(255)",
				IsNullable: true,
			},
		},
	})

	joined := strings.Join(statements, "\n")
	expectedParts := []string{
		`CREATE TABLE "app"."new table" (`,
		`"id" integer NOT NULL DEFAULT nextval('app."new table_id_seq"'::regclass)`,
		`"display name" character varying(255) NULL`,
		`PRIMARY KEY ("id")`,
	}
	for _, part := range expectedParts {
		if !strings.Contains(joined, part) {
			t.Fatalf("expected statements to contain %q, got:\n%s", part, joined)
		}
	}
}

func TestBuildCreateTableStatementsCanonicalizesSerial(t *testing.T) {
	d := New()
	normalized := normalizeSerialColumns("app", "new table", []models.ColumnDef{
		{
			Name:         "id",
			DataType:     "SERIAL",
			FullDataType: "SERIAL",
			IsNullable:   false,
			IsPrimaryKey: true,
		},
		{
			Name:         "display name",
			DataType:     "varchar(255)",
			FullDataType: "varchar(255)",
			IsNullable:   true,
		},
	})
	statements := d.BuildCreateTableStatements("app", models.SchemaTableSnapshot{
		Name:    "new table",
		Columns: normalized,
	})

	joined := strings.Join(statements, "\n")
	expectedParts := []string{
		`CREATE SEQUENCE "app"."new table_id_seq";`,
		`CREATE TABLE "app"."new table" (`,
		`"id" integer NOT NULL DEFAULT nextval('app."new table_id_seq"'::regclass)`,
		`"display name" varchar(255) NULL`,
		`PRIMARY KEY ("id")`,
		`ALTER SEQUENCE "app"."new table_id_seq" OWNED BY "app"."new table"."id";`,
	}
	for _, part := range expectedParts {
		if !strings.Contains(joined, part) {
			t.Fatalf("expected statements to contain %q, got:\n%s", part, joined)
		}
	}
}
