// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/core"
	"zentro/internal/models"
)

func CreateIndexWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, indexName string, columns []string, unique bool) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.CreateIndex(context.Background(), db, schema, tableName, indexName, columns, unique)
}

func DropIndexWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, indexName string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.DropIndex(context.Background(), db, schema, tableName, indexName)
}

func GetIndexesWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) ([]models.IndexInfo, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return nil, err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchIndexes(context.Background(), db, schema, tableName)
}
