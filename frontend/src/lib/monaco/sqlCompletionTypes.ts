// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';

export type CompletionKind = number;
export type DisposableLike = { dispose: () => void };
export type CompletionKindName =
    | 'Field'
    | 'Module'
    | 'Class'
    | 'Keyword'
    | 'Function'
    | 'Text'
    | 'Operator'
    | 'Snippet';

export interface SqlCompletionLanguagesApi {
    CompletionItemKind: Record<CompletionKindName, CompletionKind>;
    CompletionItemInsertTextRule: {
        InsertAsSnippet: number;
    };
}

export interface SqlCompletionMonacoApi {
    languages: SqlCompletionLanguagesApi;
}

export interface SqlCompletionRegisterMonacoApi extends SqlCompletionMonacoApi {
    languages: SqlCompletionLanguagesApi & {
        registerCompletionItemProvider: (
            languageSelector: string,
            provider: languages.CompletionItemProvider,
        ) => DisposableLike;
    };
}

export type SqlClause =
    | 'unknown'
    | 'select'
    | 'from'
    | 'join'
    | 'where'
    | 'having'
    | 'groupBy'
    | 'orderBy'
    | 'insert'
    | 'insertColumns'
    | 'values'
    | 'update'
    | 'set'
    | 'delete'
    | 'createTable'
    | 'createView'
    | 'alterTable'
    | 'on'
    | 'with';

export interface SqlToken {
    value: string;
    start: number;
    end: number;
    depth: number;
}

export interface SqlColumnLike {
    Name: string;
    DataType?: string;
    IsPrimaryKey?: boolean;
    IsNullable?: boolean;
    DefaultValue?: string;
}

export interface SqlTableRelationshipLike {
    ConstraintName: string;
    SourceSchema: string;
    SourceTable: string;
    SourceColumn: string;
    TargetSchema: string;
    TargetTable: string;
    TargetColumn: string;
}

export interface SqlTemplateLike {
    trigger: string;
    name: string;
    content: string;
}

export interface SqlCatalogSchema {
    Name: string;
    Tables: string[];
    ForeignTables?: string[];
    Views: string[];
    MaterializedViews?: string[];
    Indexes?: string[];
    Functions?: string[];
    Procedures?: string[];
    Sequences?: string[];
    DataTypes?: string[];
    AggregateFunctions?: string[];
}

export interface SqlSourceRef {
    kind: 'table' | 'view' | 'cte' | 'subquery';
    name: string;
    schemaName?: string;
    alias?: string;
    columns?: string[];
}

export interface SqlAnalysis {
    fullText: string;
    statementText: string;
    statementStartOffset: number;
    /** End of the statement containing the cursor, including text after the cursor. */
    statementEndOffset: number;
    cursorOffset: number;
    cursorDepth: number;
    clause: SqlClause;
    isInCommentOrString: boolean;
    afterDot: boolean;
    dotIdentifier: string;
    sources: SqlSourceRef[];
    ctes: Map<string, SqlSourceRef>;
}

export interface SqlCompletionEnv {
    monaco: SqlCompletionMonacoApi;
    schemas: SqlCatalogSchema[];
    driver: string;
    profileKey?: string;
    dbName?: string;
    currentSchema?: string;
    fetchColumns: (schemaName: string, tableName: string) => Promise<SqlColumnLike[]>;
    fetchRelationships: (
        schemaName: string,
        tableName: string,
    ) => Promise<SqlTableRelationshipLike[]>;
    templates: SqlTemplateLike[];
}

export interface SqlCompletionBuildOptions {
    shouldAbort?: () => boolean;
    /** Leading whitespace of the line being edited, used to indent generated lists. */
    lineIndent?: string;
    /** Converts a document offset to an editor position (needed to edit elsewhere). */
    positionAt?: (offset: number) => { lineNumber: number; column: number };
    // Set when the cursor sits inside an unclosed quote ("[Phone N|"), so
    // identifier suggestions replace the quoted span instead of just the word.
    quotedIdentifier?: {
        range: {
            startLineNumber: number;
            endLineNumber: number;
            startColumn: number;
            endColumn: number;
        };
        opener: string;
    };
}

export interface SuggestionRecord {
    priority: number;
    item: languages.CompletionItem;
}
