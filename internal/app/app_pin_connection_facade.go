// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"time"

	"zentro/internal/models"
)

// PinConnection and UnpinConnection are the FE-facing lifecycle for a
// Table/Catalog tab's Pinned Environment (ADR-0001,
// docs/adr/0001-pinned-environment-context-for-data-tabs.md): PinConnection
// is called once when such a tab mounts, UnpinConnection once when it
// closes. The pool ref-counts internally, so pinning the same
// connectionID/dbName from multiple tabs is safe and only opens one
// underlying connection.
func (a *App) PinConnection(connectionID, dbName string) error {
	if a.connPool == nil {
		return fmt.Errorf("connection pool not available")
	}
	if connectionID == "" || dbName == "" {
		return fmt.Errorf("pin connection: connectionID and dbName are required")
	}

	connectTimeout := a.prefs.ConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = 15
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(connectTimeout)*time.Second)
	defer cancel()

	_, err := a.connPool.Pin(ctx, connectionID, dbName, func() (*models.ConnectionProfile, error) {
		profile, err := a.resolveConnectionProfileByID(connectionID)
		if err != nil {
			return nil, err
		}
		// The pool must open the tab's actual pinned database, never the
		// resolved profile's own (optional, bootstrap-only) DBName — same
		// fix as resolvePinnedConnection, same root cause.
		clone := *profile
		clone.DBName = dbName
		return &clone, nil
	})
	return err
}

func (a *App) UnpinConnection(connectionID, dbName string) {
	if a.connPool == nil || connectionID == "" || dbName == "" {
		return
	}
	a.connPool.Unpin(connectionID, dbName)
}
