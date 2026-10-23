// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"

	"zentro/internal/core"
	"zentro/internal/models"
)

// Preview* functions return the exact DDL a schema-editor write operation
// would execute, without running it. Pure string building — no *sql.DB
// needed — used by the write-safety confirmation dialog so the user sees
// real SQL instead of a hand-written summary before approving a change.

func previewDriver(profile *models.ConnectionProfile) (interface {
	PreviewCreateIndexDDL(schema, table, indexName string, columns []string, unique bool) string
	PreviewDropIndexDDL(schema, table, indexName string) string
	PreviewAddCheckConstraintDDL(schema, table, name, expression string) string
	PreviewDropCheckConstraintDDL(schema, table, name string) string
	PreviewAddPrimaryKeyDDL(schema, table, name string, columns []string) string
	PreviewDropPrimaryKeyDDL(schema, table, name string) string
}, error) {
	if profile == nil {
		return nil, fmt.Errorf("no active connection")
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv, nil
}

func PreviewCreateIndexDDL(profile *models.ConnectionProfile, schema, table, indexName string, columns []string, unique bool) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewCreateIndexDDL(schema, table, indexName, columns, unique), nil
}

func PreviewDropIndexDDL(profile *models.ConnectionProfile, schema, table, indexName string) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewDropIndexDDL(schema, table, indexName), nil
}

func PreviewAddCheckConstraintDDL(profile *models.ConnectionProfile, schema, table, name, expression string) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewAddCheckConstraintDDL(schema, table, name, expression), nil
}

func PreviewDropCheckConstraintDDL(profile *models.ConnectionProfile, schema, table, name string) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewDropCheckConstraintDDL(schema, table, name), nil
}

func PreviewAddPrimaryKeyDDL(profile *models.ConnectionProfile, schema, table, name string, columns []string) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewAddPrimaryKeyDDL(schema, table, name, columns), nil
}

func PreviewDropPrimaryKeyDDL(profile *models.ConnectionProfile, schema, table, name string) (string, error) {
	drv, err := previewDriver(profile)
	if err != nil {
		return "", err
	}
	return drv.PreviewDropPrimaryKeyDDL(schema, table, name), nil
}
