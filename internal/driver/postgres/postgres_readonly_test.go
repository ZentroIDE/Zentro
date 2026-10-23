// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"testing"
	"time"

	"zentro/internal/models"
)

func TestRunReadOnlyRollsBackAndRejectsWritesAtTheDatabase(t *testing.T) {
	sqlDB := testPostgresDB(t)
	d := New()
	ctx := context.Background()
	if _, err := sqlDB.Exec(`CREATE TEMP TABLE zentro_ro (id int)`); err != nil {
		t.Fatal(err)
	}
	_, err := d.RunReadOnly(ctx, sqlDB, models.MCPReadOnlyQuery{
		SQL: "INSERT INTO zentro_ro VALUES (1)", MaxRows: 10, Timeout: 5 * time.Second, LockTimeout: time.Second, Schema: "public",
	})
	if err == nil {
		t.Fatal("a write should fail inside a read-only transaction")
	}
	out, err := d.RunReadOnly(ctx, sqlDB, models.MCPReadOnlyQuery{
		SQL: "SELECT 1 AS n", MaxRows: 10, Timeout: 5 * time.Second, LockTimeout: time.Second, Schema: "public",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 1 {
		t.Fatalf("%+v", out)
	}
}

func TestRunDryDoesNotKeepInsertedRows(t *testing.T) {
	sqlDB := testPostgresDB(t)
	d := New()
	ctx := context.Background()
	if _, err := sqlDB.Exec(`CREATE TABLE IF NOT EXISTS zentro_dry (id int primary key)`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = sqlDB.Exec(`DROP TABLE IF EXISTS zentro_dry`) })
	_, _ = sqlDB.Exec(`DELETE FROM zentro_dry`)

	out, err := d.RunDry(ctx, sqlDB, models.MCPDryRunQuery{
		Statements: []string{"INSERT INTO zentro_dry VALUES (1)"}, Timeout: 5 * time.Second, LockTimeout: time.Second, Schema: "public",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !out.RolledBack || len(out.Statements) != 1 || out.Statements[0].Status != "ok" {
		t.Fatalf("%+v", out)
	}
	var n int
	if err := sqlDB.QueryRow(`SELECT count(*) FROM zentro_dry`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("dry_run left %d rows", n)
	}
}
