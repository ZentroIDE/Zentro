// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"errors"
	"strings"
	"testing"

	"zentro/internal/driver"
)

func TestDecodeTriggerType(t *testing.T) {
	cases := []struct {
		tgtype int
		timing string
		events string
		row    bool
	}{
		{triggerTypeRow | triggerTypeBefore | triggerTypeUpdate, "BEFORE", "UPDATE", true},
		{triggerTypeInsert | triggerTypeDelete, "AFTER", "INSERT,DELETE", false},
		{triggerTypeRow | triggerTypeInstead | triggerTypeInsert | triggerTypeUpdate, "INSTEAD OF", "INSERT,UPDATE", true},
		{triggerTypeTruncate, "AFTER", "TRUNCATE", false},
	}
	for _, tc := range cases {
		got := decodeTriggerType(tc.tgtype)
		if got.Timing != tc.timing || strings.Join(got.Events, ",") != tc.events || got.ForEachRow != tc.row {
			t.Fatalf("tgtype %d: got %+v", tc.tgtype, got)
		}
	}
}

// --- Live Postgres ---

func TestReadTableDetails_CommentsIdentityGeneratedTriggersAndPartitions(t *testing.T) {
	sqlDB := testPostgresDB(t)
	schema := "zentro_mcp_details_test"
	ctx := context.Background()
	for _, s := range []string{
		"drop schema if exists " + schema + " cascade",
		"create schema " + schema,
		"create table " + schema + ".orders (id int generated always as identity primary key, qty int default 1, price numeric, total numeric generated always as (qty * price) stored)",
		"comment on table " + schema + ".orders is 'customer orders'",
		"comment on column " + schema + ".orders.qty is 'units'",
		"create function " + schema + ".touch() returns trigger as $$ begin return new; end; $$ language plpgsql",
		"create trigger orders_touch before update on " + schema + ".orders for each row execute function " + schema + ".touch()",
		"create table " + schema + ".events (id int, at date not null) partition by range (at)",
		"create table " + schema + ".events_2026 partition of " + schema + ".events for values from ('2026-01-01') to ('2027-01-01')",
	} {
		if _, err := sqlDB.ExecContext(ctx, s); err != nil {
			t.Fatalf("setup: %s: %v", s, err)
		}
	}
	t.Cleanup(func() { _, _ = sqlDB.ExecContext(context.Background(), "drop schema if exists "+schema+" cascade") })
	drv := New()

	details, err := drv.ReadTableDetails(ctx, sqlDB, schema, "orders")
	if err != nil {
		t.Fatalf("ReadTableDetails: %v", err)
	}
	if details.Comment != "customer orders" {
		t.Fatalf("comment = %q", details.Comment)
	}
	byName := map[string]int{}
	for i, c := range details.Columns {
		byName[c.Name] = i
	}
	if c := details.Columns[byName["id"]]; !c.IsIdentity {
		t.Fatalf("id is an identity column: %+v", c)
	}
	if c := details.Columns[byName["total"]]; !c.Generated {
		t.Fatalf("total is generated: %+v", c)
	}
	if c := details.Columns[byName["qty"]]; c.Comment != "units" || c.Default != "1" {
		t.Fatalf("qty = %+v", c)
	}
	if len(details.Triggers) != 1 || details.Triggers[0].Name != "orders_touch" || details.Triggers[0].Timing != "BEFORE" {
		t.Fatalf("triggers = %+v", details.Triggers)
	}

	events, err := drv.ReadTableDetails(ctx, sqlDB, schema, "events")
	if err != nil {
		t.Fatalf("ReadTableDetails: %v", err)
	}
	if !strings.Contains(strings.ToLower(events.PartitionKey), "range") || events.PartitionCount != 1 || len(events.Partitions) != 1 {
		t.Fatalf("partitioning = %q %d %v", events.PartitionKey, events.PartitionCount, events.Partitions)
	}

	if _, err := drv.ReadTableDetails(ctx, sqlDB, schema, "nope"); !errors.Is(err, driver.ErrObjectNotFound) {
		t.Fatalf("want ErrObjectNotFound, got %v", err)
	}
}
