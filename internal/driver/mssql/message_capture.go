// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"

	"github.com/golang-sql/sqlexp"
)

// PrepareMessageCapture implements driver.MessageCapturer.
//
// This drives the whole statement through sqlexp's documented message-loop
// pattern (see go-mssqldb's messages_example_test.go) rather than draining
// concurrently from a goroutine started before the query call: sqlexp's
// ReturnMessage is only initialized once the driver recognizes this arg
// during the QueryContext call, and reading it from a separately-started
// goroutine races that initialization with no synchronization between
// them — confirmed with `go test -race` during development, not a
// theoretical concern. Calling Message(ctx) here instead, strictly after
// QueryContext has already returned on this same goroutine, is what
// establishes a real happens-before relationship: the driver's
// initialization happened earlier in the same call, on the same goroutine,
// so this read can never race it.
//
// The trade-off is that nothing drains the driver's message channel
// (capacity 15, see go-mssqldb's token.go) while QueryContext is still
// running. For a statement producing more than 15 messages before its
// first result, the driver would block enqueueing further ones until this
// loop starts — QueryContext returning quickly (it doesn't wait for the
// whole result like ExecContext) keeps that window small in practice.
func (d *MSSQLDriver) PrepareMessageCapture(onMessage func(text string)) (args []any, drain func(ctx context.Context, rows *sql.Rows) (int64, error)) {
	retmsg := &sqlexp.ReturnMessage{}

	drain = func(ctx context.Context, rows *sql.Rows) (int64, error) {
		defer rows.Close()

		var affected int64
		var execErr error
		active := true
		for active {
			switch msg := retmsg.Message(ctx).(type) {
			case sqlexp.MsgNotice:
				if msg.Message != nil {
					onMessage(msg.Message.String())
				}
			case sqlexp.MsgNext:
				for rows.Next() {
				}
			case sqlexp.MsgNextResultSet:
				active = rows.NextResultSet()
			case sqlexp.MsgRowsAffected:
				affected = msg.Count
			case sqlexp.MsgError:
				execErr = msg.Error
			}
		}
		if err := rows.Err(); err != nil && execErr == nil {
			execErr = err
		}
		return affected, execErr
	}

	return []any{retmsg}, drain
}
