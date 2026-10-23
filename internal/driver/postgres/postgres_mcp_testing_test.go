// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"os"
	"testing"

	// Registers the "pgx" database/sql driver name. main.go does this for the
	// app; a test run of this package alone needs its own import.
	_ "github.com/jackc/pgx/v5/stdlib"
)

// testPostgresDB opens the database named by ZENTRO_TEST_PG_DSN (a standard
// Postgres connection string, e.g. "postgres://user:pass@localhost:5432/db")
// and skips the test when the variable is unset. Every test in this package
// that needs a live Postgres goes through this one helper.
func testPostgresDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("ZENTRO_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("ZENTRO_TEST_PG_DSN is not set; skipping a test that needs a live Postgres")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open ZENTRO_TEST_PG_DSN: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping ZENTRO_TEST_PG_DSN: %v", err)
	}
	return db
}
