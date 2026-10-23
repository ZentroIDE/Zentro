// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/core"
	"zentro/internal/models"
)

func GetForeignKeysWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string) ([]models.ForeignKeyInfo, error) {
	if err := ensureActiveConnection(profile, db); err != nil {
		return nil, err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", profile.Driver)
	}
	return drv.FetchForeignKeys(context.Background(), db, schema, tableName)
}

func CreateForeignKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName string, fk models.ForeignKeyInfo) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	if err := validateForeignKeyInfo(fk); err != nil {
		return fmt.Errorf("validate foreign key: %w", err)
	}
	if err := drv.CreateForeignKey(context.Background(), db, schema, tableName, fk); err != nil {
		return fmt.Errorf("create foreign key: %w", err)
	}
	return nil
}

func UpdateForeignKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, originalName string, fk models.ForeignKeyInfo) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	if !drv.SupportsForeignKeys() {
		return fmt.Errorf("foreign key management is not supported for driver: %s", profile.Driver)
	}
	if strings.TrimSpace(originalName) == "" {
		return fmt.Errorf("validate foreign key: original constraint name is required")
	}
	if err := validateForeignKeyInfo(fk); err != nil {
		return fmt.Errorf("validate foreign key: %w", err)
	}

	// Driver-native ALTER FK is not available in postgres/mysql/sqlserver for full FK definition updates.
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin update foreign key tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	ctx := context.Background()
	if err := drv.DropForeignKey(ctx, tx, schema, tableName, originalName); err != nil {
		return fmt.Errorf("update foreign key drop phase: %w", err)
	}
	if err := drv.CreateForeignKey(ctx, tx, schema, tableName, fk); err != nil {
		return fmt.Errorf("update foreign key create phase: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit update foreign key tx: %w", err)
	}
	committed = true
	return nil
}

func DropForeignKeyWithConnection(profile *models.ConnectionProfile, db *sql.DB, schema, tableName, constraintName string) error {
	if err := ensureActiveConnection(profile, db); err != nil {
		return err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return fmt.Errorf("driver %q not found", profile.Driver)
	}
	if err := drv.DropForeignKey(context.Background(), db, schema, tableName, constraintName); err != nil {
		return fmt.Errorf("drop foreign key: %w", err)
	}
	return nil
}

func validateForeignKeyInfo(fk models.ForeignKeyInfo) error {
	fk.Name = strings.TrimSpace(fk.Name)
	fk.RefSchema = strings.TrimSpace(fk.RefSchema)
	fk.RefTable = strings.TrimSpace(fk.RefTable)
	if fk.Name == "" {
		return fmt.Errorf("constraint name is required")
	}
	if len(fk.Columns) == 0 {
		return fmt.Errorf("at least one source column is required")
	}
	if fk.RefSchema == "" || fk.RefTable == "" {
		return fmt.Errorf("referenced schema and table are required")
	}
	if len(fk.RefColumns) == 0 {
		return fmt.Errorf("at least one referenced column is required")
	}
	if len(fk.Columns) != len(fk.RefColumns) {
		return fmt.Errorf("source and referenced column counts must match")
	}
	if !isSupportedForeignKeyRule(fk.OnDelete) {
		return fmt.Errorf("unsupported ON DELETE rule: %s", fk.OnDelete)
	}
	if !isSupportedForeignKeyRule(fk.OnUpdate) {
		return fmt.Errorf("unsupported ON UPDATE rule: %s", fk.OnUpdate)
	}
	return nil
}

func isSupportedForeignKeyRule(rule string) bool {
	switch strings.ToUpper(strings.TrimSpace(rule)) {
	case "", "NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT":
		return true
	default:
		return false
	}
}
