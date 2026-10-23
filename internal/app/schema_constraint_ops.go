// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"

	"zentro/internal/core"
	"zentro/internal/models"
)

// ─── Check Constraints ────────────────────────────────────────────────────────

func GetCheckConstraintsWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) ([]models.CheckConstraintInfo, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return nil, err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchCheckConstraints(context.Background(), db, schema, tableName)
}

func CreateCheckConstraintWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name, expression string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.CreateCheckConstraint(context.Background(), db, schema, tableName, name, expression)
}

func DropCheckConstraintWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.DropCheckConstraint(context.Background(), db, schema, tableName, name)
}

// ─── Unique Constraints ───────────────────────────────────────────────────────

func GetUniqueConstraintsWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) ([]models.UniqueConstraintInfo, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return nil, err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchUniqueConstraints(context.Background(), db, schema, tableName)
}

func CreateUniqueConstraintWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name string, columns []string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.CreateUniqueConstraint(context.Background(), db, schema, tableName, name, columns)
}

func DropUniqueConstraintWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.DropUniqueConstraint(context.Background(), db, schema, tableName, name)
}

// ─── Primary Key ──────────────────────────────────────────────────────────────

func GetPrimaryKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) (*models.PrimaryKeyInfo, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return nil, err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchPrimaryKey(context.Background(), db, schema, tableName)
}

func AddPrimaryKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name string, columns []string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.AddPrimaryKey(context.Background(), db, schema, tableName, name, columns)
}

func DropPrimaryKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, name string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.DropPrimaryKey(context.Background(), db, schema, tableName, name)
}
