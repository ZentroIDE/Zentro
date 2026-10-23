// SPDX-License-Identifier: GPL-3.0-only

import {
    CountReferencingRows,
    BuildQualifiedTableSelect,
    FetchDatabaseSchema,
    FetchTableColumns,
    FetchTableRelationships,
    CreateTable,
    DropObject,
    DropObjectAdvanced,
    TruncateTable,
    FetchSchemaSnapshot,
    GenerateSchemaMigration,
    GetTableDDL,
    AlterTableColumn,
    ReorderTableColumns,
    AddTableColumn,
    DropTableColumn,
    GetIndexes,
    CreateIndex,
    DropIndex,
    PreviewCreateIndexDDL,
    PreviewDropIndexDDL,
    GetCheckConstraints,
    CreateCheckConstraint,
    DropCheckConstraint,
    PreviewAddCheckConstraintDDL,
    PreviewDropCheckConstraintDDL,
    GetUniqueConstraints,
    CreateUniqueConstraint,
    DropUniqueConstraint,
    GetPrimaryKey,
    AddPrimaryKey,
    DropPrimaryKey,
    PreviewAddPrimaryKeyDDL,
    PreviewDropPrimaryKeyDDL,
    GetForeignKeys,
    CreateForeignKey,
    UpdateForeignKey,
    DropForeignKey,
    SnapshotStoredProcedures,
    GetCatalogObjectDetails,
} from '../../../wailsjs/go/app/App';
import { models as goModels } from '../../../wailsjs/go/models';
import type { SchemaMigrationResult, SchemaSnapshot } from '../../types/schemaDiff';
import type { SchemaRollbackTarget } from './types';
import { optionalWailsBinding } from './wailsOptionalBinding';

// Schema rollback is Pro (internal/app/pro_schema_rollback.go) — absent from
// a build exported without that file.
const ListSchemaRollbackTargets = optionalWailsBinding<
    (limit: number) => Promise<SchemaRollbackTarget[]>
>('ListSchemaRollbackTargets');
const RestoreSchemaRollbackTarget = optionalWailsBinding<(commitHash: string) => Promise<void>>(
    'RestoreSchemaRollbackTarget',
);

function toRecord(raw: unknown): Record<string, unknown> | undefined {
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

function mapSchemaSnapshot(raw: Record<string, unknown> | null | undefined): SchemaSnapshot {
    return {
        driver: typeof raw?.driver === 'string' ? raw.driver : '',
        profileName: typeof raw?.profileName === 'string' ? raw.profileName : '',
        databaseName: typeof raw?.databaseName === 'string' ? raw.databaseName : '',
        schemaName: typeof raw?.schemaName === 'string' ? raw.schemaName : '',
        label: typeof raw?.label === 'string' ? raw.label : '',
        capturedAt: typeof raw?.capturedAt === 'string' ? raw.capturedAt : '',
        tables: Array.isArray(raw?.tables)
            ? (raw?.tables as Record<string, unknown>[]).map(table => ({
                  name: typeof table.name === 'string' ? table.name : '',
                  ddl: typeof table.ddl === 'string' ? table.ddl : '',
                  columns: Array.isArray(table.columns)
                      ? (table.columns as SchemaSnapshot['tables'][number]['columns'])
                      : [],
              }))
            : [],
        indexes: Array.isArray(raw?.indexes)
            ? (raw?.indexes as Record<string, unknown>[]).map(index => ({
                  name: typeof index.name === 'string' ? index.name : '',
                  tableName: typeof index.tableName === 'string' ? index.tableName : '',
                  ddl: typeof index.ddl === 'string' ? index.ddl : '',
              }))
            : [],
        constraints: Array.isArray(raw?.constraints)
            ? (raw?.constraints as Record<string, unknown>[]).map(constraint => ({
                  name: typeof constraint.name === 'string' ? constraint.name : '',
                  tableName: typeof constraint.tableName === 'string' ? constraint.tableName : '',
                  type: typeof constraint.type === 'string' ? constraint.type : '',
                  ddl: typeof constraint.ddl === 'string' ? constraint.ddl : '',
              }))
            : [],
        views: Array.isArray(raw?.views)
            ? (raw?.views as Record<string, unknown>[]).map(view => ({
                  name: typeof view.name === 'string' ? view.name : '',
                  ddl: typeof view.ddl === 'string' ? view.ddl : '',
              }))
            : [],
        routines: Array.isArray(raw?.routines)
            ? (raw?.routines as Record<string, unknown>[]).map(routine => ({
                  name: typeof routine.name === 'string' ? routine.name : '',
                  signature: typeof routine.signature === 'string' ? routine.signature : '',
                  ddl: typeof routine.ddl === 'string' ? routine.ddl : '',
              }))
            : [],
        normalizedDdl: typeof raw?.normalizedDdl === 'string' ? raw.normalizedDdl : '',
        supported: raw?.supported === true,
        unsupportedMessage:
            typeof raw?.unsupportedMessage === 'string' ? raw.unsupportedMessage : undefined,
    };
}

function mapSchemaMigrationResult(
    raw: Record<string, unknown> | null | undefined,
): SchemaMigrationResult {
    return {
        supported: raw?.supported === true,
        driver: typeof raw?.driver === 'string' ? raw.driver : '',
        direction: typeof raw?.direction === 'string' ? raw.direction : '',
        sql: typeof raw?.sql === 'string' ? raw.sql : '',
        warnings: Array.isArray(raw?.warnings) ? (raw?.warnings as string[]) : [],
        unsupportedMessage:
            typeof raw?.unsupportedMessage === 'string' ? raw.unsupportedMessage : undefined,
    };
}

export const schemaAdapter = {
    BuildQualifiedTableSelect,
    FetchDatabaseSchema,
    FetchTableColumns,
    CountReferencingRows,
    FetchTableRelationships,
    CreateTable,
    DropObject,
    DropObjectAdvanced,
    TruncateTable,
    FetchSchemaSnapshot: async (profileName: string, dbName: string, schemaName: string) =>
        mapSchemaSnapshot(toRecord(await FetchSchemaSnapshot(profileName, dbName, schemaName))),
    GenerateSchemaMigration: async (left: SchemaSnapshot, right: SchemaSnapshot) =>
        mapSchemaMigrationResult(
            toRecord(
                await GenerateSchemaMigration(
                    new goModels.SchemaSnapshot(left),
                    new goModels.SchemaSnapshot(right),
                ),
            ),
        ),
    GetTableDDL,
    GetCatalogObjectDetails,
    AlterTableColumn,
    ReorderTableColumns,
    AddTableColumn,
    DropTableColumn,
    GetIndexes,
    CreateIndex,
    DropIndex,
    PreviewCreateIndexDDL,
    PreviewDropIndexDDL,
    GetCheckConstraints,
    CreateCheckConstraint,
    DropCheckConstraint,
    PreviewAddCheckConstraintDDL,
    PreviewDropCheckConstraintDDL,
    GetUniqueConstraints,
    CreateUniqueConstraint,
    DropUniqueConstraint,
    GetPrimaryKey,
    AddPrimaryKey,
    DropPrimaryKey,
    PreviewAddPrimaryKeyDDL,
    PreviewDropPrimaryKeyDDL,
    GetForeignKeys,
    CreateForeignKey,
    UpdateForeignKey,
    DropForeignKey,
    SnapshotStoredProcedures,
    ...(ListSchemaRollbackTargets ? { ListSchemaRollbackTargets } : {}),
    ...(RestoreSchemaRollbackTarget ? { RestoreSchemaRollbackTarget } : {}),
};
