// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"database/sql"
	"fmt"
	"strconv"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/models"
)

// referencingRowsFixture seeds orders(order_id) <- order_details(order_id) and
// a composite pair, on a real SQLite database with foreign keys declared.
func referencingRowsFixture(t *testing.T) (*App, *sql.DB, *models.ConnectionProfile) {
	t.Helper()
	a := setupApp(t)
	a.prefs.SchemaTimeout = 30
	db := a.db

	stmts := []string{
		`CREATE TABLE orders (order_id INTEGER PRIMARY KEY, customer TEXT)`,
		`CREATE TABLE order_details (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(order_id), qty INTEGER)`,
		`CREATE TABLE tenants (tenant_id INTEGER, user_id INTEGER, PRIMARY KEY (tenant_id, user_id))`,
		`CREATE TABLE tenant_notes (id INTEGER PRIMARY KEY, tenant_id INTEGER, user_id INTEGER)`,
		`INSERT INTO orders VALUES (10248, 'VINET'), (10249, 'TOMSP'), (10250, 'HANAR')`,
		// 10248 has no details; 10249 has two; 10250 has one.
		`INSERT INTO order_details (order_id, qty) VALUES (10249, 1), (10249, 2), (10250, 5)`,
		`INSERT INTO tenants VALUES (1, 7), (1, 8), (2, 7)`,
		`INSERT INTO tenant_notes (tenant_id, user_id) VALUES (1, 8)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("seed %q: %v", stmt, err)
		}
	}
	return a, db, &models.ConnectionProfile{Driver: constant.DriverSQLite}
}

func probeOrderDetails(keys ...string) models.ReferencingRowsProbe {
	tuples := make([][]string, len(keys))
	for i, k := range keys {
		tuples[i] = []string{k}
	}
	return models.ReferencingRowsProbe{Key: "od", Table: "order_details", Columns: []string{"order_id"}, Keys: tuples}
}

func TestCountReferencingRows_AKeyNothingPointsAtIsSafeToDelete(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)

	got, err := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails("10248")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || !got[0].Verified || got[0].Count != 0 || got[0].HasMore {
		t.Fatalf("got %+v, want a verified count of 0", got)
	}
}

func TestCountReferencingRows_CountsTheRowsThatReallyReference(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)

	got, err := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails("10249")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got[0].Verified || got[0].Count != 2 {
		t.Fatalf("got %+v, want 2 referencing rows", got[0])
	}
}

func TestCountReferencingRows_OnlyTheReferencedKeysAmongSeveralCount(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)

	// 10248 is unreferenced, the other two have 2 + 1 rows.
	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails("10248", "10249", "10250")})

	if !got[0].Verified || got[0].Count != 3 {
		t.Fatalf("got %+v, want 3", got[0])
	}
}

func TestCountReferencingRows_MatchesAnIntegerColumnFromTextKeys(t *testing.T) {
	// Keys travel as strings; the column is INTEGER. This is the case a
	// stricter database would refuse without a cast.
	a, db, profile := referencingRowsFixture(t)

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails("10250")})

	if got[0].Count != 1 {
		t.Fatalf("got %+v, want the one row for order 10250", got[0])
	}
}

func TestCountReferencingRows_CompositeKey(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	probe := func(keys ...[]string) models.ReferencingRowsProbe {
		return models.ReferencingRowsProbe{Key: "tn", Table: "tenant_notes", Columns: []string{"tenant_id", "user_id"}, Keys: keys}
	}

	// (1,7) is unreferenced, (1,8) has a note, and (2,8) must not match on user_id alone.
	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{
		probe([]string{"1", "7"}),
		probe([]string{"1", "8"}),
		probe([]string{"2", "8"}),
	})

	if got[0].Count != 0 || got[1].Count != 1 || got[2].Count != 0 {
		t.Fatalf("counts = %d, %d, %d; want 0, 1, 0", got[0].Count, got[1].Count, got[2].Count)
	}
}

func TestCountReferencingRows_EchoesEachProbesKeyInOrder(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	first, second := probeOrderDetails("10248"), probeOrderDetails("10249")
	first.Key, second.Key = "first", "second"

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{first, second})

	if got[0].Key != "first" || got[1].Key != "second" {
		t.Fatalf("keys = %q, %q", got[0].Key, got[1].Key)
	}
}

func TestCountReferencingRows_NoKeysMeansNothingCanBeReferenced(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails()})

	if !got[0].Verified || got[0].Count != 0 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestCountReferencingRows_FindsAReferenceBeyondTheFirstBatch(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	// More keys than one statement can bind; the only referenced one is last.
	keys := make([]string, 0, 2000)
	for i := 1; i <= 1999; i++ {
		keys = append(keys, strconv.Itoa(900000+i))
	}
	keys = append(keys, "10250")

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails(keys...)})

	if !got[0].Verified || got[0].Count != 1 {
		t.Fatalf("got %+v, want the reference in the last batch found", got[0])
	}
}

func TestCountReferencingRows_TooManyKeysIsUnverifiedNotAssumedSafe(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	keys := make([]string, 0, 25000)
	for i := 0; i < 25000; i++ {
		keys = append(keys, strconv.Itoa(1000000+i))
	}

	got, err := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails(keys...)})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Verified {
		t.Fatalf("got %+v, want unverified so the caller stays cautious", got[0])
	}
}

func TestCountReferencingRows_CapsTheCountAndSaysSo(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	for i := 0; i < 1100; i++ {
		if _, err := db.Exec(`INSERT INTO order_details (order_id, qty) VALUES (10248, ?)`, i); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{probeOrderDetails("10248")})

	if !got[0].Verified || got[0].Count != 1000 || !got[0].HasMore {
		t.Fatalf("got %+v, want 1000 with HasMore", got[0])
	}
}

func TestCountReferencingRows_AFailedProbeIsUnverifiedAndDoesNotSpoilTheOthers(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)
	missing := probeOrderDetails("10249")
	missing.Key, missing.Table = "missing", "no_such_table"

	got, err := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{missing, probeOrderDetails("10249")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Verified || got[0].Error == "" {
		t.Fatalf("got %+v, want unverified with the reason", got[0])
	}
	if !got[1].Verified || got[1].Count != 2 {
		t.Fatalf("got %+v, want the second probe unaffected", got[1])
	}
}

func TestCountReferencingRows_NoColumnsIsUnverified(t *testing.T) {
	a, db, profile := referencingRowsFixture(t)

	got, _ := a.svc.Conn.CountReferencingRows(profile, db, []models.ReferencingRowsProbe{
		{Key: "x", Table: "order_details", Keys: [][]string{{"1"}}},
	})

	if got[0].Verified {
		t.Fatalf("got %+v, want unverified", got[0])
	}
}

func TestCountReferencingRows_RefusesWithoutAConnection(t *testing.T) {
	a := setupApp(t)
	a.prefs.SchemaTimeout = 30

	if _, err := a.svc.Conn.CountReferencingRows(nil, nil, nil); err == nil {
		t.Fatal("expected an error without a connection")
	}
	if _, err := a.svc.Conn.CountReferencingRows(&models.ConnectionProfile{Driver: "no-such-driver"}, a.db, nil); err == nil {
		t.Fatal(fmt.Sprint("expected an error for an unknown driver"))
	}
}
