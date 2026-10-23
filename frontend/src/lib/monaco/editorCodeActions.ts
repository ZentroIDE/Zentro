// SPDX-License-Identifier: GPL-3.0-only

import type { editor, IDisposable, IRange, languages } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import type { SchemaNode } from '../../stores/schemaStore';
import { getSchemasForActiveDatabase, quoteIdentifierForDriver } from './sqlCompletionIdentifiers';
import type { SqlColumnLike } from './sqlCompletionTypes';
import type { ColumnTableRef, SqlColumnWarning } from './sqlColumnValidation';
import type { SqlSchemaWarning } from './sqlSchemaWarnings';
import { readLineIndent } from './sqlSelectListFormat';
import { SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID } from './sqlSuggestionSchemaContext';
import { findSqlObjectMatches } from './sqlTableNavigation';
import {
    buildWildcardEdit,
    findSelectWildcards,
    type SelectWildcard,
    type WildcardEdit,
    type WildcardExpansionEnv,
} from './sqlWildcardExpansion';

// Ctrl+. actions for the SQL editor. The provider is registered once per
// editor and reads live state through `SqlCodeActionDeps`, so it never holds
// stale connection, schema or warning data.

export interface SqlCodeActionConnection {
    profileName: string;
    dbName: string;
    driver: string;
}

export interface SqlCodeActionDeps {
    getConnection: () => SqlCodeActionConnection | null;
    getCurrentSchema: () => string;
    getEnvironmentKey: () => string | undefined;
    getTrees: () => Record<string, SchemaNode[]>;
    getSchemaWarnings: () => SqlSchemaWarning[];
    getColumnWarnings: () => SqlColumnWarning[];
    /** Id of the editor command that re-reads table columns, once registered. */
    getRefreshColumnsCommandId: () => string | undefined;
    fetchColumns: (schemaName: string, tableName: string) => Promise<SqlColumnLike[]>;
}

type CodeAction = languages.CodeAction;

const EMPTY_ACTIONS: languages.CodeActionList = { actions: [], dispose: () => {} };

function toRange(model: editor.ITextModel, startOffset: number, endOffset: number): IRange {
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(endOffset);
    return {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
    };
}

function toOffsetSpan(model: editor.ITextModel, range: IRange) {
    return {
        start: model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }),
        end: model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }),
    };
}

// --- Switch schema ----------------------------------------------------------

function warningOverlapsRange(
    model: editor.ITextModel,
    warning: { startOffset: number; endOffset: number },
    range: IRange,
): boolean {
    const start = model.getPositionAt(warning.startOffset);
    const end = model.getPositionAt(warning.endOffset);
    if (start.lineNumber > range.endLineNumber) return false;
    if (end.lineNumber < range.startLineNumber) return false;
    if (start.lineNumber === range.endLineNumber && start.column > range.endColumn) return false;
    if (end.lineNumber === range.startLineNumber && end.column < range.startColumn) return false;
    return true;
}

function buildSwitchSchemaAction(schemaName: string): CodeAction {
    const title = `Switch schema to ${schemaName}`;
    return {
        title,
        kind: 'quickfix',
        diagnostics: [],
        isPreferred: true,
        command: {
            id: SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID,
            title,
            arguments: [{ schemaName }],
        },
    };
}

function provideSchemaSwitchActions(
    model: editor.ITextModel,
    range: IRange,
    deps: SqlCodeActionDeps,
): CodeAction[] {
    const connection = deps.getConnection();
    const currentSchemaName = deps.getCurrentSchema();
    if (!connection || !currentSchemaName || !deps.getEnvironmentKey()) return [];

    const allSchemas = getSchemasForActiveDatabase(
        deps.getTrees(),
        connection.profileName,
        connection.dbName,
    );
    return deps
        .getSchemaWarnings()
        .filter(warning => warningOverlapsRange(model, warning, range))
        .flatMap(warning => {
            const seenSchemas = new Set<string>();
            return findSqlObjectMatches(allSchemas, [warning.objectName])
                .filter(match => match.schemaName !== currentSchemaName)
                .sort((left, right) => left.schemaName.localeCompare(right.schemaName))
                .filter(match => {
                    const normalizedSchema = match.schemaName.trim().toLowerCase();
                    if (!normalizedSchema || seenSchemas.has(normalizedSchema)) return false;
                    seenSchemas.add(normalizedSchema);
                    return true;
                })
                .map(match => buildSwitchSchemaAction(match.schemaName));
        });
}

// --- Expand * ---------------------------------------------------------------

function buildExpandWildcardAction(
    model: editor.ITextModel,
    wildcard: SelectWildcard,
    edit: WildcardEdit,
): CodeAction {
    const label = wildcard.qualifier ? `${wildcard.qualifier}.*` : '*';
    return {
        title: `Expand ${label} to columns`,
        kind: 'refactor.rewrite',
        edit: {
            edits: [
                {
                    resource: model.uri,
                    versionId: model.getVersionId(),
                    textEdit: {
                        range: toRange(model, edit.startOffset, edit.endOffset),
                        text: edit.text,
                    },
                },
            ],
        },
    };
}

/** Catalog, driver and column loader for wildcard expansion; null without a loaded catalog. */
export function resolveWildcardEnv(deps: SqlCodeActionDeps): WildcardExpansionEnv | null {
    const connection = deps.getConnection();
    if (!connection) return null;
    const schemas = getSchemasForActiveDatabase(
        deps.getTrees(),
        connection.profileName,
        connection.dbName,
    );
    if (schemas.length === 0) return null;
    return {
        schemas,
        currentSchema: deps.getCurrentSchema(),
        driver: connection.driver,
        fetchColumns: deps.fetchColumns,
    };
}

async function provideWildcardActions(
    model: editor.ITextModel,
    range: IRange,
    deps: SqlCodeActionDeps,
): Promise<CodeAction[]> {
    const env = resolveWildcardEnv(deps);
    if (!env) return [];

    const sqlText = model.getValue();
    const span = toOffsetSpan(model, range);
    const touched = findSelectWildcards(sqlText).filter(
        wildcard => wildcard.startOffset <= span.end && wildcard.endOffset >= span.start,
    );

    const actions: CodeAction[] = [];
    for (const wildcard of touched) {
        const lineNumber = model.getPositionAt(wildcard.startOffset).lineNumber;
        const lineIndent = readLineIndent(model.getLineContent(lineNumber));
        const edit = await buildWildcardEdit(sqlText, wildcard, env, lineIndent);
        if (edit) actions.push(buildExpandWildcardAction(model, wildcard, edit));
    }
    return actions;
}

// --- Unknown columns --------------------------------------------------------

function buildChangeColumnAction(
    model: editor.ITextModel,
    warning: SqlColumnWarning,
    suggestion: string,
    driver: string,
    isPreferred: boolean,
): CodeAction {
    // A column that was written quoted stays quoted, whatever its new name.
    const replacement = quoteIdentifierForDriver(suggestion, driver, warning.quoted);
    return {
        title: `Change to "${suggestion}"`,
        kind: 'quickfix',
        isPreferred,
        edit: {
            edits: [
                {
                    resource: model.uri,
                    versionId: model.getVersionId(),
                    textEdit: {
                        range: toRange(model, warning.startOffset, warning.endOffset),
                        text: replacement,
                    },
                },
            ],
        },
    };
}

function buildQualifyColumnAction(
    model: editor.ITextModel,
    warning: SqlColumnWarning,
    qualifier: string,
    driver: string,
): CodeAction {
    const qualified = `${quoteIdentifierForDriver(qualifier, driver)}.${quoteIdentifierForDriver(warning.columnName, driver, warning.quoted)}`;
    return {
        title: `Qualify as ${qualifier}.${warning.columnName}`,
        kind: 'quickfix',
        edit: {
            edits: [
                {
                    resource: model.uri,
                    versionId: model.getVersionId(),
                    textEdit: {
                        range: toRange(model, warning.startOffset, warning.endOffset),
                        text: qualified,
                    },
                },
            ],
        },
    };
}

function buildRefreshColumnsAction(commandId: string, tables: ColumnTableRef[]): CodeAction {
    const title = `Refresh columns of ${tables.map(table => table.name).join(', ')}`;
    return {
        title,
        kind: 'quickfix',
        command: { id: commandId, title, arguments: [tables] },
    };
}

function provideColumnFixActions(
    model: editor.ITextModel,
    range: IRange,
    deps: SqlCodeActionDeps,
): CodeAction[] {
    const driver = deps.getConnection()?.driver ?? '';
    const refreshCommandId = deps.getRefreshColumnsCommandId();
    const seenRefreshes = new Set<string>();

    return deps
        .getColumnWarnings()
        .filter(warning => warningOverlapsRange(model, warning, range))
        .flatMap(warning => {
            // Which table was meant is the user's call, so no option is preferred.
            if (warning.kind === 'ambiguous') {
                return warning.qualifiers.map(qualifier =>
                    buildQualifyColumnAction(model, warning, qualifier, driver),
                );
            }
            const actions = warning.suggestions.map((suggestion, index) =>
                buildChangeColumnAction(model, warning, suggestion, driver, index === 0),
            );
            const refreshKey = warning.tables
                .map(table => `${table.schemaName}.${table.name}`)
                .join();
            if (refreshCommandId && warning.tables.length > 0 && !seenRefreshes.has(refreshKey)) {
                seenRefreshes.add(refreshKey);
                actions.push(buildRefreshColumnsAction(refreshCommandId, warning.tables));
            }
            return actions;
        });
}

// --- Registration -----------------------------------------------------------

export function registerSqlCodeActions(
    monaco: Monaco,
    codeEditor: editor.IStandaloneCodeEditor,
    deps: SqlCodeActionDeps,
): IDisposable {
    return monaco.languages.registerCodeActionProvider('sql', {
        provideCodeActions: async (model, range, _context, token) => {
            const editorModel = codeEditor.getModel();
            if (!editorModel || model.uri.toString() !== editorModel.uri.toString()) {
                return EMPTY_ACTIONS;
            }
            const switchActions = provideSchemaSwitchActions(model, range, deps);
            const columnActions = provideColumnFixActions(model, range, deps);
            const wildcardActions = await provideWildcardActions(model, range, deps);
            if (token.isCancellationRequested) return EMPTY_ACTIONS;
            return {
                actions: [...switchActions, ...columnActions, ...wildcardActions],
                dispose: () => {},
            };
        },
    });
}
