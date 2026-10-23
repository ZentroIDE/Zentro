// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"
	"time"

	"zentro/internal/core"
	"zentro/internal/models"
)

// GetCatalogObjectDetails returns DDL/metadata for one named catalog object
// (index, routine, sequence, data type, ...). Dialect-specific SQL lives in
// each driver adapter behind the CatalogDetailsFetcher port.
func (a *App) GetCatalogObjectDetails(connectionID, dbName, schema, objectKind, name, tableName string) (models.CatalogObjectDetails, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return models.CatalogObjectDetails{}, err
	}
	defer release()
	if db == nil || profile == nil {
		return models.CatalogObjectDetails{}, fmt.Errorf("no active connection")
	}

	drv, ok := core.Get(profile.Driver)
	if !ok {
		return models.CatalogObjectDetails{}, fmt.Errorf("unsupported driver: %s", profile.Driver)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return drv.CatalogObjectDetails(ctx, db, schema, objectKind, name, tableName)
}
