// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"zentro/internal/driver"
)

// maxSessionQueryLen caps how much of a session's query text crosses the
// wire to the FE — server sessions can be running arbitrarily long SQL.
const maxSessionQueryLen = 2000

// ListSessions implements driver.SessionMonitor using
// information_schema.PROCESSLIST. CONNECTION_ID() of the listing
// connection itself is excluded, so a session never reports on itself.
func (d *MySQLDriver) ListSessions(ctx context.Context, db *sql.DB) ([]driver.ServerSession, error) {
	const query = `
SELECT ID, USER, COALESCE(DB, ''), HOST, COMMAND, TIME, COALESCE(STATE, ''), COALESCE(INFO, '')
FROM information_schema.PROCESSLIST
WHERE ID <> CONNECTION_ID()
ORDER BY TIME DESC`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []driver.ServerSession
	for rows.Next() {
		var (
			id                   int64
			user, database, host string
			command, state, info string
			seconds              int64
		)
		if err := rows.Scan(&id, &user, &database, &host, &command, &seconds, &state, &info); err != nil {
			return nil, err
		}

		query := info
		if len(query) > maxSessionQueryLen {
			query = query[:maxSessionQueryLen]
		}

		sessions = append(sessions, driver.ServerSession{
			ID:         strconv.FormatInt(id, 10),
			User:       user,
			Database:   database,
			Client:     host,
			State:      command,
			StartedAt:  time.Now().Add(-time.Duration(seconds) * time.Second),
			DurationMs: seconds * 1000,
			Wait:       state,
			Query:      query,
		})
	}
	return sessions, rows.Err()
}
