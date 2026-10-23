// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

// parseBackendPID validates a backend id string as a positive integer
// before it's ever used in a query, so CancelBackend never builds SQL out
// of unvalidated input.
func parseBackendPID(id string) (int, error) {
	pid, err := strconv.Atoi(strings.TrimSpace(id))
	if err != nil || pid <= 0 {
		return 0, fmt.Errorf("invalid backend id %q", id)
	}
	return pid, nil
}

// pgCancelBackendQuery picks the soft-cancel or force-kill server function.
func pgCancelBackendQuery(force bool) string {
	if force {
		return "SELECT pg_terminate_backend($1)"
	}
	return "SELECT pg_cancel_backend($1)"
}

// BackendID implements driver.BackendCanceller.
func (d *PostgresDriver) BackendID(ctx context.Context, conn *sql.Conn) (string, error) {
	var pid int
	if err := conn.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
		return "", fmt.Errorf("read backend pid: %w", err)
	}
	return strconv.Itoa(pid), nil
}

// CancelBackend implements driver.BackendCanceller. force=false calls
// pg_cancel_backend (interrupts the running statement, session stays
// open); force=true calls pg_terminate_backend (ends the whole session,
// rolling back any open transaction).
func (d *PostgresDriver) CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error {
	pid, err := parseBackendPID(id)
	if err != nil {
		return err
	}
	var ok bool
	if err := db.QueryRowContext(ctx, pgCancelBackendQuery(force), pid).Scan(&ok); err != nil {
		return fmt.Errorf("cancel backend %d: %w", pid, err)
	}
	if !ok {
		return fmt.Errorf("backend %d was not signalled — it may have already finished", pid)
	}
	return nil
}
