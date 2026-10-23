// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { SchemaAdapter } from '../contracts/schema';
import type { RestHttpClient } from './httpClient';
import type { models } from '../../../../wailsjs/go/models';
import type { SchemaMigrationResult, SchemaSnapshot } from '../../../types/schemaDiff';
import type { CatalogObjectDetails, SchemaRollbackTarget } from '../types';

export function createSchemaRestAdapter(client: RestHttpClient): SchemaAdapter {
    return withKernelResult('schema', {
        fetchDatabaseSchema: (connectionID: string, dbName: string) =>
            client.call<void>('/schema/fetch-database-schema', { connectionID, dbName }),
        buildQualifiedTableSelect: (connectionID: string, schema: string, table: string) =>
            client.call<string>('/schema/build-qualified-table-select', {
                connectionID,
                schema,
                table,
            }),
        fetchTableColumns: (connectionID: string, dbName: string, schema: string, table: string) =>
            client.call<models.ColumnDef[]>('/schema/fetch-table-columns', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        countReferencingRows: (
            connectionID: string,
            dbName: string,
            probes: models.ReferencingRowsProbe[],
        ) =>
            client.call<models.ReferencingRowsResult[]>('/schema/count-referencing-rows', {
                connectionID,
                dbName,
                probes,
            }),
        fetchTableRelationships: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
        ) =>
            client.call<models.TableRelationship[]>('/schema/fetch-table-relationships', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        createTable: (
            connectionID: string,
            dbName: string,
            schema: string,
            tableName: string,
            columns: models.ColumnDef[],
        ) =>
            client.call<void>('/schema/create-table', {
                connectionID,
                dbName,
                schema,
                tableName,
                columns,
            }),
        dropObject: (
            connectionID: string,
            dbName: string,
            schema: string,
            objectName: string,
            objectType: string,
        ) =>
            client.call<void>('/schema/drop-object', {
                connectionID,
                dbName,
                schema,
                objectName,
                objectType,
            }),
        dropObjectAdvanced: (
            connectionID: string,
            dbName: string,
            schema: string,
            objectName: string,
            objectType: string,
            cascade: boolean,
        ) =>
            client.call<void>('/schema/drop-object-advanced', {
                connectionID,
                dbName,
                schema,
                objectName,
                objectType,
                cascade,
            }),
        truncateTable: (
            connectionID: string,
            dbName: string,
            schema: string,
            tableName: string,
            cascade: boolean,
            restartIdentity: boolean,
        ) =>
            client.call<void>('/schema/truncate-table', {
                connectionID,
                dbName,
                schema,
                tableName,
                cascade,
                restartIdentity,
            }),
        fetchSchemaSnapshot: (connectionID: string, dbName: string, schemaName: string) =>
            client.call<SchemaSnapshot>('/schema/fetch-schema-snapshot', {
                connectionID,
                dbName,
                schemaName,
            }),
        listSchemaRollbackTargets: (limit: number) =>
            client.call<SchemaRollbackTarget[]>('/schema/list-rollback-targets', { limit }),
        restoreSchemaRollbackTarget: (commitHash: string) =>
            client.call<void>('/schema/restore-rollback-target', { commitHash }),
        generateSchemaMigration: (left: SchemaSnapshot, right: SchemaSnapshot) =>
            client.call<SchemaMigrationResult>('/schema/generate-schema-migration', {
                left,
                right,
            }),
        getTableDDL: (connectionID: string, dbName: string, schema: string, tableName: string) =>
            client.call<string>('/schema/get-table-ddl', {
                connectionID,
                dbName,
                schema,
                tableName,
            }),
        getCatalogObjectDetails: (
            connectionID: string,
            dbName: string,
            schema: string,
            objectKind: string,
            name: string,
            tableName?: string,
        ) =>
            client.call<CatalogObjectDetails>('/schema/get-catalog-object-details', {
                connectionID,
                dbName,
                schema,
                objectKind,
                name,
                tableName,
            }),
        snapshotStoredProcedures: (schema: string) =>
            client.call<number>('/schema/snapshot-stored-procedures', { schema }),
        runGitTrackingMigration: () => client.call<void>('/schema/run-git-tracking-migration'),
        getIndexes: (connectionID: string, dbName: string, schema: string, table: string) =>
            client.call<models.IndexInfo[]>('/schema/get-indexes', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        createIndex: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            indexName: string,
            columns: string[],
            unique: boolean,
        ) =>
            client.call<void>('/schema/create-index', {
                connectionID,
                dbName,
                schema,
                table,
                indexName,
                columns,
                unique,
            }),
        dropIndex: (
            connectionID: string,
            dbName: string,
            schema: string,
            tableName: string,
            indexName: string,
        ) =>
            client.call<void>('/schema/drop-index', {
                connectionID,
                dbName,
                schema,
                tableName,
                indexName,
            }),
        previewCreateIndexDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            indexName: string,
            columns: string[],
            unique: boolean,
        ) =>
            client.call<string>('/schema/preview-create-index-ddl', {
                connectionID,
                dbName,
                schema,
                table,
                indexName,
                columns,
                unique,
            }),
        previewDropIndexDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            tableName: string,
            indexName: string,
        ) =>
            client.call<string>('/schema/preview-drop-index-ddl', {
                connectionID,
                dbName,
                schema,
                tableName,
                indexName,
            }),
        getCheckConstraints: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
        ) =>
            client.call<models.CheckConstraintInfo[]>('/schema/get-check-constraints', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        getUniqueConstraints: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
        ) =>
            client.call<models.UniqueConstraintInfo[]>('/schema/get-unique-constraints', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        createUniqueConstraint: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
            columns: string[],
        ) =>
            client.call<void>('/schema/create-unique-constraint', {
                connectionID,
                dbName,
                schema,
                table,
                name,
                columns,
            }),
        dropUniqueConstraint: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<void>('/schema/drop-unique-constraint', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
        getPrimaryKey: (connectionID: string, dbName: string, schema: string, table: string) =>
            client.call<models.PrimaryKeyInfo | null>('/schema/get-primary-key', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        getForeignKeys: (connectionID: string, dbName: string, schema: string, table: string) =>
            client.call<models.ForeignKeyInfo[]>('/schema/get-foreign-keys', {
                connectionID,
                dbName,
                schema,
                table,
            }),
        alterTableColumn: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            current: models.ColumnDef,
            next: models.ColumnDef,
        ) =>
            client.call<void>('/schema/alter-table-column', {
                connectionID,
                dbName,
                schema,
                table,
                current,
                next,
            }),
        addTableColumn: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            col: models.ColumnDef,
        ) =>
            client.call<void>('/schema/add-table-column', {
                connectionID,
                dbName,
                schema,
                table,
                col,
            }),
        dropTableColumn: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            columnName: string,
        ) =>
            client.call<void>('/schema/drop-table-column', {
                connectionID,
                dbName,
                schema,
                table,
                columnName,
            }),
        reorderTableColumns: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            newOrder: string[],
        ) =>
            client.call<void>('/schema/reorder-table-columns', {
                connectionID,
                dbName,
                schema,
                table,
                newOrder,
            }),
        createCheckConstraint: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
            expression: string,
        ) =>
            client.call<void>('/schema/create-check-constraint', {
                connectionID,
                dbName,
                schema,
                table,
                name,
                expression,
            }),
        dropCheckConstraint: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<void>('/schema/drop-check-constraint', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
        previewAddCheckConstraintDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
            expression: string,
        ) =>
            client.call<string>('/schema/preview-add-check-constraint-ddl', {
                connectionID,
                dbName,
                schema,
                table,
                name,
                expression,
            }),
        previewDropCheckConstraintDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<string>('/schema/preview-drop-check-constraint-ddl', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
        addPrimaryKey: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
            columns: string[],
        ) =>
            client.call<void>('/schema/add-primary-key', {
                connectionID,
                dbName,
                schema,
                table,
                name,
                columns,
            }),
        dropPrimaryKey: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<void>('/schema/drop-primary-key', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
        previewAddPrimaryKeyDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
            columns: string[],
        ) =>
            client.call<string>('/schema/preview-add-primary-key-ddl', {
                connectionID,
                dbName,
                schema,
                table,
                name,
                columns,
            }),
        previewDropPrimaryKeyDDL: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<string>('/schema/preview-drop-primary-key-ddl', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
        createForeignKey: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            fk: models.ForeignKeyInfo,
        ) =>
            client.call<void>('/schema/create-foreign-key', {
                connectionID,
                dbName,
                schema,
                table,
                fk,
            }),
        updateForeignKey: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            originalName: string,
            fk: models.ForeignKeyInfo,
        ) =>
            client.call<void>('/schema/update-foreign-key', {
                connectionID,
                dbName,
                schema,
                table,
                originalName,
                fk,
            }),
        dropForeignKey: (
            connectionID: string,
            dbName: string,
            schema: string,
            table: string,
            name: string,
        ) =>
            client.call<void>('/schema/drop-foreign-key', {
                connectionID,
                dbName,
                schema,
                table,
                name,
            }),
    });
}
