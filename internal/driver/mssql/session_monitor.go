// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"zentro/internal/driver"
)

// ListSessions implements driver.SessionMonitor using sys.dm_exec_sessions
// joined to sys.dm_exec_requests (for the currently running statement, if
// any) and sys.dm_exec_sql_text (for that statement's text). @@SPID of the
// listing connection itself is excluded, so a session never reports on
// itself. Only user sessions are listed — SQL Server's own background and
// system sessions are noise here.
func (d *MSSQLDriver) ListSessions(ctx context.Context, db *sql.DB) ([]driver.ServerSession, error) {
	const query = `
SELECT
	s.session_id,
	COALESCE(s.login_name, ''),
	COALESCE(DB_NAME(s.database_id), ''),
	COALESCE(s.host_name, ''),
	COALESCE(r.status, s.status, ''),
	COALESCE(r.start_time, s.login_time),
	COALESCE(r.wait_type, ''),
	COALESCE(LEFT(t.text, 2000), '')
FROM sys.dm_exec_sessions s
LEFT JOIN sys.dm_exec_requests r ON r.session_id = s.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE s.session_id <> @@SPID AND s.is_user_process = 1
ORDER BY COALESCE(r.start_time, s.login_time) DESC`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []driver.ServerSession
	for rows.Next() {
		var (
			sessionID                 int
			user, database, host      string
			state, waitType, queryTxt string
			startedAt                 time.Time
		)
		if err := rows.Scan(&sessionID, &user, &database, &host, &state, &startedAt, &waitType, &queryTxt); err != nil {
			return nil, err
		}

		sessions = append(sessions, driver.ServerSession{
			ID:         strconv.Itoa(sessionID),
			User:       user,
			Database:   database,
			Client:     host,
			State:      state,
			StartedAt:  startedAt,
			DurationMs: time.Since(startedAt).Milliseconds(),
			Wait:       waitType,
			Query:      queryTxt,
		})
	}
	return sessions, rows.Err()
}
