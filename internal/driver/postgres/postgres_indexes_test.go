// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"testing"
)

func setupIndexesSchema(t *testing.T, sqlDB *sql.DB) string {
	t.Helper()
	schema := "zentro_mcp_indexes_test"
	ctx := context.Background()
	stmts := []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".zentro_mcp_i1 (id int primary key, tag text, status text)",
		"create index zentro_mcp_i1_tag_idx on " + schema + ".zentro_mcp_i1 (tag, status)",
		"create unique index zentro_mcp_i1_status_uidx on " + schema + ".zentro_mcp_i1 (status) where status is not null",
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

func TestReadIndexes_ListsThePrimaryKeyAndBothCreatedIndexes(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupIndexesSchema(t, sqlDB)
	drv := New()

	indexes, err := drv.ReadIndexes(context.Background(), sqlDB, schema, "zentro_mcp_i1")
	if err != nil {
		t.Fatalf("ReadIndexes: %v", err)
	}
	if len(indexes) != 3 {
		t.Fatalf("got %d indexes, want 3: %+v", len(indexes), indexes)
	}

	var pk, multi, partial bool
	for _, idx := range indexes {
		if idx.Primary {
			pk = true
			if !idx.Unique {
				t.Fatalf("primary key index is not marked unique: %+v", idx)
			}
		}
		if idx.Name == "zentro_mcp_i1_tag_idx" {
			multi = true
			if len(idx.Columns) != 2 || idx.Columns[0] != "tag" || idx.Columns[1] != "status" {
				t.Fatalf("composite index columns in wrong order: %+v", idx.Columns)
			}
			if idx.Unique {
				t.Fatal("zentro_mcp_i1_tag_idx is not unique but was reported unique")
			}
		}
		if idx.Name == "zentro_mcp_i1_status_uidx" {
			partial = true
			if idx.Predicate == "" {
				t.Fatal("a partial index's predicate was not reported")
			}
			if !idx.Unique {
				t.Fatal("zentro_mcp_i1_status_uidx is unique but was not reported unique")
			}
		}
		if !idx.Valid {
			t.Fatalf("a freshly created index was reported invalid: %+v", idx)
		}
		if idx.Method == "" {
			t.Fatalf("Method (access method) is empty: %+v", idx)
		}
	}
	if !pk {
		t.Fatal("no primary key index was found")
	}
	if !multi {
		t.Fatal("the composite index was not found")
	}
	if !partial {
		t.Fatal("the partial unique index was not found")
	}
}

func TestReadIndexes_UnknownTableReturnsAnEmptySlice(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := setupIndexesSchema(t, sqlDB)
	drv := New()

	indexes, err := drv.ReadIndexes(context.Background(), sqlDB, schema, "zentro_mcp_does_not_exist")
	if err != nil {
		t.Fatalf("ReadIndexes: %v", err)
	}
	if len(indexes) != 0 {
		t.Fatalf("got %d indexes for a nonexistent table, want 0", len(indexes))
	}
}
