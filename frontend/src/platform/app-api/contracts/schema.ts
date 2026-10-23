// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';
import type { SchemaMigrationResult, SchemaSnapshot } from '../../../types/schemaDiff';
import type { CatalogObjectDetails, SchemaRollbackTarget } from '../types';

export interface SchemaAdapter {
    fetchDatabaseSchema(profileName: string, dbName: string): Promise<KernelResult<void>>;
    // Dialect-correct "SELECT * FROM <schema>.<table>" per connectionID's
    // driver (ADR-0001) — Table tabs must call this instead of hardcoding
    // ANSI double-quote identifier syntax, since a Pinned Environment can
    // target a different DB engine (e.g. MySQL, which needs backticks).
    buildQualifiedTableSelect(
        connectionID: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<string>>;
    fetchTableColumns(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.ColumnDef[]>>;
    fetchTableRelationships(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.TableRelationship[]>>;
    /**
     * Checks the data rather than the schema: for each probe, how many rows of
     * that child table actually reference the given parent keys. Every probe
     * gets an answer; an unverified one means "could not tell", never "safe".
     */
    countReferencingRows(
        connectionID: string,
        dbName: string,
        probes: models.ReferencingRowsProbe[],
    ): Promise<KernelResult<models.ReferencingRowsResult[]>>;
    createTable(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        columns: models.ColumnDef[],
    ): Promise<KernelResult<void>>;
    dropObject(
        connectionID: string,
        dbName: string,
        schema: string,
        objectName: string,
        objectType: string,
    ): Promise<KernelResult<void>>;
    dropObjectAdvanced(
        connectionID: string,
        dbName: string,
        schema: string,
        objectName: string,
        objectType: string,
        cascade: boolean,
    ): Promise<KernelResult<void>>;
    truncateTable(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        cascade: boolean,
        restartIdentity: boolean,
    ): Promise<KernelResult<void>>;
    fetchSchemaSnapshot(
        profileName: string,
        dbName: string,
        schemaName: string,
    ): Promise<KernelResult<SchemaSnapshot>>;
    listSchemaRollbackTargets?(limit: number): Promise<KernelResult<SchemaRollbackTarget[]>>;
    restoreSchemaRollbackTarget?(commitHash: string): Promise<KernelResult<void>>;
    generateSchemaMigration(
        left: SchemaSnapshot,
        right: SchemaSnapshot,
    ): Promise<KernelResult<SchemaMigrationResult>>;
    getTableDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
    ): Promise<KernelResult<string>>;
    getCatalogObjectDetails(
        connectionID: string,
        dbName: string,
        schema: string,
        objectKind: string,
        name: string,
        tableName?: string,
    ): Promise<KernelResult<CatalogObjectDetails>>;
    snapshotStoredProcedures(schema: string): Promise<KernelResult<number>>;
    runGitTrackingMigration(): Promise<KernelResult<void>>;

    getIndexes(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.IndexInfo[]>>;
    createIndex(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        indexName: string,
        columns: string[],
        unique: boolean,
    ): Promise<KernelResult<void>>;
    dropIndex(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        indexName: string,
    ): Promise<KernelResult<void>>;
    previewCreateIndexDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        indexName: string,
        columns: string[],
        unique: boolean,
    ): Promise<KernelResult<string>>;
    previewDropIndexDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        tableName: string,
        indexName: string,
    ): Promise<KernelResult<string>>;
    getCheckConstraints(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.CheckConstraintInfo[]>>;
    getUniqueConstraints(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.UniqueConstraintInfo[]>>;
    createUniqueConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<KernelResult<void>>;
    dropUniqueConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<void>>;
    getPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.PrimaryKeyInfo | null>>;
    getForeignKeys(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
    ): Promise<KernelResult<models.ForeignKeyInfo[]>>;
    alterTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        current: models.ColumnDef,
        next: models.ColumnDef,
    ): Promise<KernelResult<void>>;
    addTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        col: models.ColumnDef,
    ): Promise<KernelResult<void>>;
    dropTableColumn(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        columnName: string,
    ): Promise<KernelResult<void>>;
    reorderTableColumns(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        newOrder: string[],
    ): Promise<KernelResult<void>>;
    createCheckConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        expression: string,
    ): Promise<KernelResult<void>>;
    dropCheckConstraint(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<void>>;
    previewAddCheckConstraintDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        expression: string,
    ): Promise<KernelResult<string>>;
    previewDropCheckConstraintDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<string>>;
    addPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<KernelResult<void>>;
    dropPrimaryKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<void>>;
    previewAddPrimaryKeyDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
        columns: string[],
    ): Promise<KernelResult<string>>;
    previewDropPrimaryKeyDDL(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<string>>;
    createForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        fk: models.ForeignKeyInfo,
    ): Promise<KernelResult<void>>;
    updateForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        originalName: string,
        fk: models.ForeignKeyInfo,
    ): Promise<KernelResult<void>>;
    dropForeignKey(
        connectionID: string,
        dbName: string,
        schema: string,
        table: string,
        name: string,
    ): Promise<KernelResult<void>>;
}
