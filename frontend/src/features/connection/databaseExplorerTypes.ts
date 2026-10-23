// SPDX-License-Identifier: GPL-3.0-only

import type { SchemaNode } from '../../stores/schemaStore';
import type { DroppableObjectType } from '../../lib/constants';

export const CATEGORY_KEY = {
    TABLES: 'tables',
    FOREIGN_TABLES: 'foreign_tables',
    VIEWS: 'views',
    MATERIALIZED_VIEWS: 'materialized_views',
    INDEXES: 'indexes',
    FUNCTIONS: 'functions',
    PROCEDURES: 'procedures',
    SEQUENCES: 'sequences',
    DATA_TYPES: 'data_types',
    AGGREGATE_FUNCTIONS: 'aggregate_functions',
} as const;

export type CategoryKey = (typeof CATEGORY_KEY)[keyof typeof CATEGORY_KEY];

export type DatabaseExplorerIcon =
    | 'table'
    | 'foreign_table'
    | 'view'
    | 'materialized_view'
    | 'index'
    | 'function'
    | 'procedure'
    | 'sequence'
    | 'data_type'
    | 'aggregate'
    | 'schema';

export interface DriverCategoryDefinition {
    key: CategoryKey;
    label: string;
    icon: DatabaseExplorerIcon;
    itemIcon: DatabaseExplorerIcon;
    getItems: (schema: SchemaNode) => string[];
    canOpenDefinition: boolean;
    allowCreateTable: boolean;
    dropObjectType: DroppableObjectType | null;
}

export interface ObjectLeafNode {
    id: string;
    name: string;
    schemaName: string;
    categoryKey: CategoryKey;
    categoryLabel: string;
}

export interface SchemaBucketNode {
    id: string;
    schemaName: string;
    items: ObjectLeafNode[];
    totalCount: number;
}

export interface CategoryGroupNode {
    id: string;
    key: CategoryKey;
    label: string;
    icon: DatabaseExplorerIcon;
    itemIcon: DatabaseExplorerIcon;
    schemas: SchemaBucketNode[];
    totalCount: number;
    canOpenDefinition: boolean;
    allowCreateTable: boolean;
    dropObjectType: DroppableObjectType | null;
}
