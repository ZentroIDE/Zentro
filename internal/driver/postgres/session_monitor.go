// SPDX-License-Identifier: GPL-3.0-only

package postgres

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

// ListSessions implements driver.SessionMonitor using pg_stat_activity.
// pg_backend_pid() of the listing connection itself is excluded, so a
// session never reports on itself. backend_type = 'client backend' (added
// in PG 10) excludes Postgres's own internal background workers —
// autovacuum, the background writer, checkpointer, WAL writer, logical
// replication launcher, etc. — which pg_cancel_backend/pg_terminate_backend
// can never signal (the engine itself refuses), so listing them here would
// only let a user pick a row that's always going to fail to cancel/kill.
func (d *PostgresDriver) ListSessions(ctx context.Context, db *sql.DB) ([]driver.ServerSession, error) {
	const query = `
SELECT
	pid,
	COALESCE(usename, ''),
	COALESCE(datname, ''),
	COALESCE(client_addr::text, ''),
	client_port,
	COALESCE(state, ''),
	query_start,
	COALESCE(wait_event_type, ''),
	COALESCE(wait_event, ''),
	LEFT(COALESCE(query, ''), $1)
FROM pg_stat_activity
WHERE pid <> pg_backend_pid() AND backend_type = 'client backend'
ORDER BY query_start DESC NULLS LAST`

	rows, err := db.QueryContext(ctx, query, maxSessionQueryLen)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []driver.ServerSession
	for rows.Next() {
		var (
			pid                     int
			user, database          string
			clientAddr              string
			clientPort              sql.NullInt64
			state                   string
			queryStart              sql.NullTime
			waitEventType, waitEven string
			queryText               string
		)
		if err := rows.Scan(&pid, &user, &database, &clientAddr, &clientPort, &state,
			&queryStart, &waitEventType, &waitEven, &queryText); err != nil {
			return nil, err
		}

		client := clientAddr
		if client == "" {
			client = "local"
		} else if clientPort.Valid {
			client = client + ":" + strconv.FormatInt(clientPort.Int64, 10)
		}

		wait := waitEventType
		if waitEven != "" {
			if wait != "" {
				wait = wait + ": " + waitEven
			} else {
				wait = waitEven
			}
		}

		var startedAt time.Time
		var durationMs int64
		if queryStart.Valid {
			startedAt = queryStart.Time
			durationMs = time.Since(startedAt).Milliseconds()
		}

		sessions = append(sessions, driver.ServerSession{
			ID:         strconv.Itoa(pid),
			User:       user,
			Database:   database,
			Client:     client,
			State:      state,
			StartedAt:  startedAt,
			DurationMs: durationMs,
			Wait:       wait,
			Query:      queryText,
		})
	}
	return sessions, rows.Err()
}
