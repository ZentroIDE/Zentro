// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/golang-sql/sqlexp"

	"zentro/internal/constant"
	"zentro/internal/utils"
)

type stringerMessage string

func (s stringerMessage) String() string { return string(s) }

// messageCaptureExecutor is a sqlExecutor that simulates go-mssqldb: when it
// sees a *sqlexp.ReturnMessage arg, it initializes it and enqueues the given
// messages before returning real rows from an in-memory sqlite DB (drain
// needs a concrete *sql.Rows — database/sql exposes no Rows interface).
type messageCaptureExecutor struct {
	t        *testing.T
	db       *sql.DB
	messages []sqlexp.RawMessage
}

func (e *messageCaptureExecutor) QueryContext(ctx context.Context, _ string, args ...any) (*sql.Rows, error) {
	for _, arg := range args {
		retmsg, ok := arg.(*sqlexp.ReturnMessage)
		if !ok {
			continue
		}
		sqlexp.ReturnMessageInit(retmsg)
		for _, msg := range e.messages {
			if err := sqlexp.ReturnMessageEnqueue(ctx, retmsg, msg); err != nil {
				e.t.Fatalf("enqueue failed: %v", err)
			}
		}
	}
	return e.db.QueryContext(ctx, "SELECT 1")
}

func (e *messageCaptureExecutor) QueryRowContext(_ context.Context, _ string, _ ...any) *sql.Row {
	return &sql.Row{}
}

func (e *messageCaptureExecutor) ExecContext(_ context.Context, _ string, _ ...any) (sql.Result, error) {
	e.t.Fatal("ExecContext should not be called when the driver implements MessageCapturer")
	return nil, nil
}

// TestExecNonSelect_MSSQL_CapturesServerMessages exercises execNonSelect
// against the real registered MSSQL driver (TestMain registers it under
// constant.DriverSQLServer), confirming PRINT-style messages surface as
// EventQueryMessage and the statement's rows-affected count still comes
// through correctly via the message-loop path.
func TestExecNonSelect_MSSQL_CapturesServerMessages(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	executor := &messageCaptureExecutor{
		t:  t,
		db: db,
		messages: []sqlexp.RawMessage{
			sqlexp.MsgNotice{Message: stringerMessage("hello")},
			sqlexp.MsgNotice{Message: stringerMessage("world")},
			sqlexp.MsgRowsAffected{Count: 7},
			sqlexp.MsgNextResultSet{},
		},
	}

	var mu sync.Mutex
	var gotMessages []string
	svc := NewQueryService(
		context.Background(),
		utils.NewLogger(nil),
		func() utils.Preferences { return utils.Preferences{ChunkSize: 10, QueryTimeout: 5} },
		func() *sql.DB { return db },
		func() sqlExecutor { return executor },
		func() string { return constant.DriverSQLServer },
		func() string { return "" },
		func() string { return "" },
		nil,
		funcEventEmitter{fn: func(_ context.Context, eventName string, payload any) {
			if eventName != constant.EventQueryMessage {
				return
			}
			if data, ok := payload.(QueryMessageEvent); ok {
				mu.Lock()
				gotMessages = append(gotMessages, data.Text)
				mu.Unlock()
			}
		}},
	)

	statement := queryStatement{SourceTabID: "tab-1", TabID: "tab-1::0", Text: "PRINT 'hello'; PRINT 'world';"}
	affected, err := svc.execNonSelect(context.Background(), executor, statement, time.Now(), true)
	if err != nil {
		t.Fatalf("execNonSelect returned error: %v", err)
	}
	if affected != 7 {
		t.Fatalf("expected affected=7, got %d", affected)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(gotMessages) != 2 || gotMessages[0] != "hello" || gotMessages[1] != "world" {
		t.Fatalf("unexpected captured messages: %v", gotMessages)
	}
}
