// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

// parseConnectionID validates a connection id string as a positive integer
// before it's ever used to build a KILL statement.
func parseConnectionID(id string) (int64, error) {
	connID, err := strconv.ParseInt(strings.TrimSpace(id), 10, 64)
	if err != nil || connID <= 0 {
		return 0, fmt.Errorf("invalid connection id %q", id)
	}
	return connID, nil
}

// mysqlKillStatement builds the KILL statement text. MySQL's KILL/KILL
// QUERY don't accept bind parameters for the connection id (only a literal
// integer), so the id is formatted directly here — safe only because
// parseConnectionID has already rejected anything but a plain integer.
func mysqlKillStatement(connID int64, force bool) string {
	verb := "KILL QUERY"
	if force {
		verb = "KILL"
	}
	return fmt.Sprintf("%s %d", verb, connID)
}

// BackendID implements driver.BackendCanceller.
func (d *MySQLDriver) BackendID(ctx context.Context, conn *sql.Conn) (string, error) {
	var id int64
	if err := conn.QueryRowContext(ctx, "SELECT CONNECTION_ID()").Scan(&id); err != nil {
		return "", fmt.Errorf("read connection id: %w", err)
	}
	return strconv.FormatInt(id, 10), nil
}

// CancelBackend implements driver.BackendCanceller. force=false runs KILL
// QUERY (interrupts the running statement, session stays open); force=true
// runs KILL (ends the whole session, rolling back any open transaction).
func (d *MySQLDriver) CancelBackend(ctx context.Context, db *sql.DB, id string, force bool) error {
	connID, err := parseConnectionID(id)
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, mysqlKillStatement(connID, force)); err != nil {
		return fmt.Errorf("kill connection %d: %w", connID, err)
	}
	return nil
}
