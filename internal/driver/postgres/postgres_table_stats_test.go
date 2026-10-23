// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func setupTableStatsSchema(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	schema := "zentro_mcp_stats_test"
	ctx := context.Background()
	stmts := []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".zentro_mcp_s1 (id int primary key, name text, tag text)",
		"create index zentro_mcp_s1_tag_idx on " + schema + ".zentro_mcp_s1 (tag)",
		"insert into " + schema + ".zentro_mcp_s1 (id, name, tag) select g, 'name-'||g, 'tag-'||(g%5) from generate_series(1,200) g",
		"analyze " + schema + ".zentro_mcp_s1",
	}
	for _, s := range stmts {
		if _, err := sqlDB.ExecContext(ctx, s); err != nil {
			t.Fatalf("setup: %s: %v", s, err)
		}
	}
	t.Cleanup(func() {
		_, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade")
	})
	return schema
}

func TestReadTableStats_AfterAnalyzeHasRowEstimateAndByteSizes(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupTableStatsSchema(t, sqlDB)
	drv := New()

	stats, err := drv.ReadTableStats(context.Background(), sqlDB, schema, "zentro_mcp_s1", false)
	if err != nil {
		t.Fatalf("ReadTableStats: %v", err)
	}
	if stats.EstRows == nil {
		t.Fatal("EstRows is nil after an explicit ANALYZE")
	}
	if *stats.EstRows != 200 {
		t.Fatalf("EstRows = %d, want 200", *stats.EstRows)
	}
	if stats.TableBytes <= 0 {
		t.Fatalf("TableBytes = %d, want > 0", stats.TableBytes)
	}
	if stats.IndexBytes <= 0 {
		t.Fatalf("IndexBytes = %d, want > 0 (there is an index)", stats.IndexBytes)
	}
	if stats.LastAnalyze == nil {
		t.Fatal("LastAnalyze is nil right after an explicit ANALYZE")
	}
	if len(stats.Columns) != 0 {
		t.Fatalf("withColumns was false but Columns is populated: %+v", stats.Columns)
	}
}

func TestReadTableStats_NeverAnalyzedHasNilEstRows(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupTableStatsSchema(t, sqlDB)
	drv := New()

	if _, err := sqlDB.ExecContext(context.Background(), "create table "+schema+".zentro_mcp_fresh (id int primary key)"); err != nil {
		t.Fatal(err)
	}

	stats, err := drv.ReadTableStats(context.Background(), sqlDB, schema, "zentro_mcp_fresh", false)
	if err != nil {
		t.Fatalf("ReadTableStats: %v", err)
	}
	if stats.EstRows != nil {
		t.Fatalf("EstRows = %v, want nil for a never-analyzed table", *stats.EstRows)
	}
}

func TestReadTableStats_WithColumnsNeverLeaksSampleValues(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupTableStatsSchema(t, sqlDB)
	drv := New()

	stats, err := drv.ReadTableStats(context.Background(), sqlDB, schema, "zentro_mcp_s1", true)
	if err != nil {
		t.Fatalf("ReadTableStats: %v", err)
	}
	if len(stats.Columns) == 0 {
		t.Fatal("withColumns was true but no columns came back")
	}
	for _, c := range stats.Columns {
		if c.Name == "" {
			t.Fatal("a column has no name")
		}
	}

	// MCPTableStatsColumn has no field at all for most_common_vals or
	// histogram_bounds, so there is no field to assert is empty here; this
	// only confirms a column's Name is itself a column name, not a sample
	// row value that leaked through some other path.
	for _, c := range stats.Columns {
		if strings.Contains(c.Name, "tag-") {
			t.Fatalf("a sample value leaked into the column name: %q", c.Name)
		}
	}
}

func TestReadTableStats_UnknownTableIsAnError(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupTableStatsSchema(t, sqlDB)
	drv := New()

	if _, err := drv.ReadTableStats(context.Background(), sqlDB, schema, "zentro_mcp_does_not_exist", false); err == nil {
		t.Fatal("expected an error for an unknown table")
	}
}
