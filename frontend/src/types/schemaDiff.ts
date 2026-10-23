// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../wailsjs/go/models';
import type { EnvironmentKey } from '../lib/constants';

export interface SchemaDiffSource {
    environmentKey?: EnvironmentKey | string;
    profileName: string;
    databaseName: string;
    schemaName: string;
    label: string;
}

export interface SchemaTableSnapshot {
    name: string;
    ddl: string;
    columns: models.ColumnDef[];
}

export interface SchemaIndexSnapshot {
    name: string;
    tableName: string;
    ddl: string;
}

export interface SchemaConstraintSnapshot {
    name: string;
    tableName: string;
    type: string;
    ddl: string;
}

export interface SchemaViewSnapshot {
    name: string;
    ddl: string;
}

export interface SchemaRoutineSnapshot {
    name: string;
    signature: string;
    ddl: string;
}

export interface SchemaSnapshot {
    driver: string;
    profileName: string;
    databaseName: string;
    schemaName: string;
    label: string;
    capturedAt: string;
    tables: SchemaTableSnapshot[];
    indexes?: SchemaIndexSnapshot[];
    constraints?: SchemaConstraintSnapshot[];
    views?: SchemaViewSnapshot[];
    routines?: SchemaRoutineSnapshot[];
    normalizedDdl: string;
    supported: boolean;
    unsupportedMessage?: string;
}

export interface SchemaMigrationResult {
    supported: boolean;
    driver: string;
    direction: string;
    sql: string;
    warnings: string[];
    unsupportedMessage?: string;
}
