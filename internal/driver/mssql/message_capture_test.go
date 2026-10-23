// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"testing"

	"github.com/golang-sql/sqlexp"
	_ "modernc.org/sqlite" // registers the "sqlite" driver, used only to obtain a real *sql.Rows for these tests
)

type stringerMessage string

func (s stringerMessage) String() string { return string(s) }

// openTestRows returns a real *sql.Rows from an in-memory sqlite DB — the
// mssql driver isn't available in unit tests, and drain's signature needs a
// concrete *sql.Rows (database/sql exposes no Rows interface), so any real
// *sql.Rows works for exercising drain's own state machine.
func openTestRows(t *testing.T) *sql.Rows {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	rows, err := db.QueryContext(context.Background(), "SELECT 1")
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	return rows
}

func TestPrepareMessageCapture_DeliversNoticesAndAffectedCount(t *testing.T) {
	d := &MSSQLDriver{}
	var captured []string
	args, drain := d.PrepareMessageCapture(func(text string) {
		captured = append(captured, text)
	})

	if len(args) != 1 {
		t.Fatalf("expected 1 extra arg, got %d", len(args))
	}
	retmsg, ok := args[0].(*sqlexp.ReturnMessage)
	if !ok {
		t.Fatalf("expected *sqlexp.ReturnMessage, got %T", args[0])
	}

	// Simulate what go-mssqldb does when it recognizes this arg type during
	// QueryContext's own argument checking, and what it enqueues while
	// processing the statement — all synchronously, before drain (which
	// mirrors real usage: drain only ever runs after QueryContext returns).
	sqlexp.ReturnMessageInit(retmsg)
	ctx := context.Background()
	mustEnqueue := func(msg sqlexp.RawMessage) {
		t.Helper()
		if err := sqlexp.ReturnMessageEnqueue(ctx, retmsg, msg); err != nil {
			t.Fatalf("enqueue failed: %v", err)
		}
	}
	mustEnqueue(sqlexp.MsgNotice{Message: stringerMessage("hello")})
	mustEnqueue(sqlexp.MsgNotice{Message: stringerMessage("world")})
	mustEnqueue(sqlexp.MsgRowsAffected{Count: 3})
	mustEnqueue(sqlexp.MsgNextResultSet{})

	affected, err := drain(ctx, openTestRows(t))
	if err != nil {
		t.Fatalf("drain returned error: %v", err)
	}
	if affected != 3 {
		t.Fatalf("expected affected=3, got %d", affected)
	}
	if len(captured) != 2 || captured[0] != "hello" || captured[1] != "world" {
		t.Fatalf("unexpected captured messages: %v", captured)
	}
}

func TestPrepareMessageCapture_SurfacesMsgError(t *testing.T) {
	d := &MSSQLDriver{}
	args, drain := d.PrepareMessageCapture(func(string) {})
	retmsg := args[0].(*sqlexp.ReturnMessage)
	sqlexp.ReturnMessageInit(retmsg)

	ctx := context.Background()
	wantErr := context.DeadlineExceeded
	if err := sqlexp.ReturnMessageEnqueue(ctx, retmsg, sqlexp.MsgError{Error: wantErr}); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}
	if err := sqlexp.ReturnMessageEnqueue(ctx, retmsg, sqlexp.MsgNextResultSet{}); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	_, err := drain(ctx, openTestRows(t))
	if err != wantErr {
		t.Fatalf("expected drain to surface the MsgError, got %v", err)
	}
}
