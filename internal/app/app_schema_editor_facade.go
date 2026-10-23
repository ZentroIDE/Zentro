// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

// Schema-editor facade — table/index/constraint/foreign-key DDL, thin
// delegates to the schema_*_ops services behind the write-safety gate.
// Every method resolves its own connection via resolvePinnedConnection
// (resolve_pinned_connection.go) instead of the ambient a.profile/a.db, so a
// call scoped to a Table/Catalog tab's Pinned Environment (ADR-0001) always
// targets that environment regardless of what's currently the ambient
// Active Environment.

func (a *App) GetTableDDL(connectionID, dbName, schema, tableName string) (string, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return GetTableDDLWithConnection(profile, db, schema, tableName)
}

func (a *App) DropObject(connectionID, dbName, schema, objectName, objectType string) error {
	if err := a.ensureWritable("drop object"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropObjectWithConnection(profile, db, schema, objectName, objectType)
}

func (a *App) DropObjectAdvanced(connectionID, dbName, schema, objectName, objectType string, cascade bool) error {
	if err := a.ensureWritable("drop object"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropObjectAdvancedWithConnection(profile, db, schema, objectName, objectType, cascade)
}

func (a *App) TruncateTable(connectionID, dbName, schema, tableName string, cascade bool, restartIdentity bool) error {
	if err := a.ensureWritable("truncate table"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return TruncateTableWithConnection(profile, db, schema, tableName, cascade, restartIdentity)
}

func (a *App) CreateTable(connectionID, dbName, schema, tableName string, columns []models.ColumnDef) error {
	if err := a.ensureWritable("create table"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return CreateTableWithConnection(profile, db, schema, tableName, columns)
}

func (a *App) CreateIndex(connectionID, dbName, schema, tableName, indexName string, columns []string, unique bool) error {
	if err := a.ensureWritable("create index"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return CreateIndexWithConnection(profile, db, schema, tableName, indexName, columns, unique)
}

// PreviewCreateIndexDDL returns the CREATE INDEX statement CreateIndex would
// execute, without running it — used to show real SQL in the write-safety
// confirmation dialog. Preview builders are pure (dialect + names in, DDL
// text out) so they only need the resolved profile, not a live connection.
func (a *App) PreviewCreateIndexDDL(connectionID, dbName, schema, tableName, indexName string, columns []string, unique bool) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewCreateIndexDDL(profile, schema, tableName, indexName, columns, unique)
}

func (a *App) DropIndex(connectionID, dbName, schema, tableName, indexName string) error {
	if err := a.ensureWritable("drop index"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropIndexWithConnection(profile, db, schema, tableName, indexName)
}

// PreviewDropIndexDDL returns the DROP INDEX statement DropIndex would
// execute, without running it.
func (a *App) PreviewDropIndexDDL(connectionID, dbName, schema, tableName, indexName string) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewDropIndexDDL(profile, schema, tableName, indexName)
}

func (a *App) GetIndexes(connectionID, dbName, schema, tableName string) ([]models.IndexInfo, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return GetIndexesWithConnection(profile, db, schema, tableName)
}

func (a *App) GetCheckConstraints(connectionID, dbName, schema, tableName string) ([]models.CheckConstraintInfo, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return GetCheckConstraintsWithConnection(profile, db, schema, tableName)
}

func (a *App) CreateCheckConstraint(connectionID, dbName, schema, tableName, name, expression string) error {
	if err := a.ensureWritable("create check constraint"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return CreateCheckConstraintWithConnection(profile, db, schema, tableName, name, expression)
}

// PreviewAddCheckConstraintDDL returns the statement CreateCheckConstraint
// would execute, without running it.
func (a *App) PreviewAddCheckConstraintDDL(connectionID, dbName, schema, tableName, name, expression string) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewAddCheckConstraintDDL(profile, schema, tableName, name, expression)
}

func (a *App) DropCheckConstraint(connectionID, dbName, schema, tableName, name string) error {
	if err := a.ensureWritable("drop check constraint"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropCheckConstraintWithConnection(profile, db, schema, tableName, name)
}

// PreviewDropCheckConstraintDDL returns the statement DropCheckConstraint
// would execute, without running it.
func (a *App) PreviewDropCheckConstraintDDL(connectionID, dbName, schema, tableName, name string) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewDropCheckConstraintDDL(profile, schema, tableName, name)
}

func (a *App) GetUniqueConstraints(connectionID, dbName, schema, tableName string) ([]models.UniqueConstraintInfo, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return GetUniqueConstraintsWithConnection(profile, db, schema, tableName)
}

func (a *App) CreateUniqueConstraint(connectionID, dbName, schema, tableName, name string, columns []string) error {
	if err := a.ensureWritable("create unique constraint"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return CreateUniqueConstraintWithConnection(profile, db, schema, tableName, name, columns)
}

func (a *App) DropUniqueConstraint(connectionID, dbName, schema, tableName, name string) error {
	if err := a.ensureWritable("drop unique constraint"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropUniqueConstraintWithConnection(profile, db, schema, tableName, name)
}

func (a *App) GetPrimaryKey(connectionID, dbName, schema, tableName string) (*models.PrimaryKeyInfo, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return GetPrimaryKeyWithConnection(profile, db, schema, tableName)
}

func (a *App) AddPrimaryKey(connectionID, dbName, schema, tableName, name string, columns []string) error {
	if err := a.ensureWritable("add primary key"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return AddPrimaryKeyWithConnection(profile, db, schema, tableName, name, columns)
}

// PreviewAddPrimaryKeyDDL returns the statement AddPrimaryKey would execute,
// without running it.
func (a *App) PreviewAddPrimaryKeyDDL(connectionID, dbName, schema, tableName, name string, columns []string) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewAddPrimaryKeyDDL(profile, schema, tableName, name, columns)
}

func (a *App) DropPrimaryKey(connectionID, dbName, schema, tableName, name string) error {
	if err := a.ensureWritable("drop primary key"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropPrimaryKeyWithConnection(profile, db, schema, tableName, name)
}

// PreviewDropPrimaryKeyDDL returns the statement DropPrimaryKey would
// execute, without running it.
func (a *App) PreviewDropPrimaryKeyDDL(connectionID, dbName, schema, tableName, name string) (string, error) {
	profile, _, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return "", err
	}
	defer release()
	return PreviewDropPrimaryKeyDDL(profile, schema, tableName, name)
}

func (a *App) GetForeignKeys(connectionID, dbName, schema, tableName string) ([]models.ForeignKeyInfo, error) {
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return nil, err
	}
	defer release()
	return GetForeignKeysWithConnection(profile, db, schema, tableName)
}

func (a *App) CreateForeignKey(connectionID, dbName, schema, tableName string, fk models.ForeignKeyInfo) error {
	if err := a.ensureWritable("create foreign key"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return CreateForeignKeyWithConnection(profile, db, schema, tableName, fk)
}

func (a *App) UpdateForeignKey(connectionID, dbName, schema, tableName, originalName string, fk models.ForeignKeyInfo) error {
	if err := a.ensureWritable("update foreign key"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return UpdateForeignKeyWithConnection(profile, db, schema, tableName, originalName, fk)
}

func (a *App) DropForeignKey(connectionID, dbName, schema, tableName, constraintName string) error {
	if err := a.ensureWritable("drop foreign key"); err != nil {
		return err
	}
	profile, db, release, err := a.resolvePinnedConnection(connectionID, dbName)
	if err != nil {
		return err
	}
	defer release()
	return DropForeignKeyWithConnection(profile, db, schema, tableName, constraintName)
}
