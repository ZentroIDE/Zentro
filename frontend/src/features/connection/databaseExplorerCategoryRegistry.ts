// SPDX-License-Identifier: GPL-3.0-only

import { OBJECT_TYPE } from '../../lib/constants';
import { DRIVER } from '../../lib/constants';
import type { SchemaNode } from '../../stores/schemaStore';
import type { CategoryKey, DriverCategoryDefinition } from './databaseExplorerTypes';
import { CATEGORY_KEY } from './databaseExplorerTypes';

const CATEGORY_DEFINITION_MAP: Record<CategoryKey, DriverCategoryDefinition> = {
    tables: {
        key: CATEGORY_KEY.TABLES,
        label: 'Tables',
        icon: 'table',
        itemIcon: 'table',
        getItems: schema => schema.Tables || [],
        canOpenDefinition: true,
        allowCreateTable: true,
        dropObjectType: OBJECT_TYPE.TABLE,
    },
    foreign_tables: {
        key: CATEGORY_KEY.FOREIGN_TABLES,
        label: 'Foreign Tables',
        icon: 'foreign_table',
        itemIcon: 'foreign_table',
        getItems: schema => schema.ForeignTables || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    views: {
        key: CATEGORY_KEY.VIEWS,
        label: 'Views',
        icon: 'view',
        itemIcon: 'view',
        getItems: schema => schema.Views || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: OBJECT_TYPE.VIEW,
    },
    materialized_views: {
        key: CATEGORY_KEY.MATERIALIZED_VIEWS,
        label: 'Materialized Views',
        icon: 'materialized_view',
        itemIcon: 'materialized_view',
        getItems: schema => schema.MaterializedViews || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: OBJECT_TYPE.VIEW,
    },
    indexes: {
        key: CATEGORY_KEY.INDEXES,
        label: 'Indexes',
        icon: 'index',
        itemIcon: 'index',
        getItems: schema => schema.Indexes || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    functions: {
        key: CATEGORY_KEY.FUNCTIONS,
        label: 'Functions',
        icon: 'function',
        itemIcon: 'function',
        getItems: schema => schema.Functions || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    procedures: {
        key: CATEGORY_KEY.PROCEDURES,
        label: 'Procedures',
        icon: 'procedure',
        itemIcon: 'procedure',
        getItems: schema => schema.Procedures || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    sequences: {
        key: CATEGORY_KEY.SEQUENCES,
        label: 'Sequences',
        icon: 'sequence',
        itemIcon: 'sequence',
        getItems: schema => schema.Sequences || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    data_types: {
        key: CATEGORY_KEY.DATA_TYPES,
        label: 'Data types',
        icon: 'data_type',
        itemIcon: 'data_type',
        getItems: schema => schema.DataTypes || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
    aggregate_functions: {
        key: CATEGORY_KEY.AGGREGATE_FUNCTIONS,
        label: 'Aggregate functions',
        icon: 'aggregate',
        itemIcon: 'aggregate',
        getItems: schema => schema.AggregateFunctions || [],
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: null,
    },
};

const DRIVER_CATEGORY_ORDER: Record<string, CategoryKey[]> = {
    [DRIVER.POSTGRES]: [
        CATEGORY_KEY.TABLES,
        CATEGORY_KEY.FOREIGN_TABLES,
        CATEGORY_KEY.VIEWS,
        CATEGORY_KEY.MATERIALIZED_VIEWS,
        CATEGORY_KEY.INDEXES,
        CATEGORY_KEY.FUNCTIONS,
        CATEGORY_KEY.PROCEDURES,
        CATEGORY_KEY.SEQUENCES,
        CATEGORY_KEY.DATA_TYPES,
        CATEGORY_KEY.AGGREGATE_FUNCTIONS,
    ],
    [DRIVER.SQLSERVER]: ['tables', 'views', 'indexes', 'functions', 'procedures', 'data_types'],
    [DRIVER.MYSQL]: ['tables', 'views', 'indexes', 'functions', 'procedures'],
    [DRIVER.SQLITE]: ['tables', 'views', 'indexes'],
};

function toDefinitionList(keys: CategoryKey[]): DriverCategoryDefinition[] {
    return keys.map(key => CATEGORY_DEFINITION_MAP[key]);
}

export function getDriverCategoryDefinitions(driver: string): DriverCategoryDefinition[] {
    const order = DRIVER_CATEGORY_ORDER[driver] || DRIVER_CATEGORY_ORDER[DRIVER.POSTGRES];
    return toDefinitionList(order);
}
