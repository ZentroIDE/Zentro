// SPDX-License-Identifier: GPL-3.0-only

export interface ErdEdgeData extends Record<string, unknown> {
    label?: string;
}

export interface ErdColumn {
    name: string;
    type: string;
    isPk: boolean;
    isFk: boolean;
}

export interface TableNodeData extends Record<string, unknown> {
    label: string;
    columns: ErdColumn[];
    isFocus?: boolean;
}

export interface TableRelationship {
    ConstraintName: string;
    SourceSchema: string;
    SourceTable: string;
    SourceColumn: string;
    TargetSchema: string;
    TargetTable: string;
    TargetColumn: string;
    OnDelete?: string;
    OnUpdate?: string;
}

export interface ConstraintGroup extends TableRelationship {
    columns: string[];
    targets: string[];
}
