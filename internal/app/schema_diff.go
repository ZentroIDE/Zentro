// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

func (a *App) FetchSchemaSnapshot(profileName, dbName, schemaName string) (models.SchemaSnapshot, error) {
	conn, err := a.resolveConnectionProfileByID(profileName)
	if err != nil {
		return models.SchemaSnapshot{}, err
	}
	return fetchSchemaSnapshot(conn, profileName, dbName, schemaName)
}

func (a *App) GenerateSchemaMigration(left, right models.SchemaSnapshot) (models.SchemaMigrationResult, error) {
	return generateSchemaMigration(left, right)
}
