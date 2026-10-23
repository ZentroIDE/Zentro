// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

// parseSPID validates a SQL Server session id string as a positive integer
// before it's ever used to build a KILL statement.
func parseSPID(id string) (int, error) {
	spid, err := strconv.Atoi(strings.TrimSpace(id))
	if err != nil || spid <= 0 {
		return 0, fmt.Errorf("invalid spid %q", id)
	}
	return spid, nil
}

// mssqlKillStatement builds the KILL statement text. KILL doesn't accept
// bind parameters for the spid (only a literal integer), so the id is
// formatted directly here — safe only because parseSPID has already
// rejected anything but a plain integer.
func mssqlKillStatement(spid int) string {
	return fmt.Sprintf("KILL %d", spid)
}

// BackendID implements driver.BackendCanceller.
func (d *MSSQLDriver) BackendID(ctx context.Context, conn *sql.Conn) (string, error) {
	var spid int
	if err := conn.QueryRowContext(ctx, "SELECT @@SPID").Scan(&spid); err != nil {
		return "", fmt.Errorf("read @@SPID: %w", err)
	}
	return strconv.Itoa(spid), nil
}

// CancelBackend implements driver.BackendCanceller. SQL Server has no
// session-scoped soft-cancel of its own: a driver-level context
// cancellation already sends an attention signal that interrupts the
// running statement without touching the session, so force=false is a
// no-op here — the caller's ctx cancel already asked SQL Server to stop.
// force=true runs KILL <spid>, ending the whole session and rolling back
// its open transaction.
func (d *MSSQLDriver) CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error {
	if !force {
		return nil
	}
	spid, err := parseSPID(id)
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, mssqlKillStatement(spid)); err != nil {
		return fmt.Errorf("kill spid %d: %w", spid, err)
	}
	return nil
}
