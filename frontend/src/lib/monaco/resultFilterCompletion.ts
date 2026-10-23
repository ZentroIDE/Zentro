// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import type { SchemaNode } from '../../stores/schemaStore';
import { buildCompletionPlan } from './sqlCompletionEngineCore';
import { createEmptyCompletionMemory } from './sqlCompletionMemory';
import { toMonacoCompletionItems } from './sqlCompletionAdapter';
import { resolveQuotedIdentifier } from './sqlCompletionIdentifiers';
import { buildEditorCompletionPlan } from './sqlCompletionOrchestrator';
import {
    SqlCompletionRegisterMonacoApi,
    SqlColumnLike,
    DisposableLike,
} from './sqlCompletionTypes';

const RESULT_FILTER_MODEL_PATH_SEGMENT = '/result-filter/';

export interface ResultFilterCompletionParams {
    monaco: SqlCompletionRegisterMonacoApi;
    filterText: string;
    cursorOffset: number;
    currentWord: string;
    range: {
        startLineNumber: number;
        endLineNumber: number;
        startColumn: number;
        endColumn: number;
    };
    columns: string[];
    driver?: string;
    baseQuery?: string;
    schemas?: SchemaNode[];
    fetchColumns?: (schemaName: string, tableName: string) => Promise<SqlColumnLike[]>;
    currentSchema?: string;
}

export interface RegisterResultFilterCompletionParams {
    monaco: SqlCompletionRegisterMonacoApi;
    modelPath: string;
    columns: string[];
    driver?: string;
    baseQuery?: string;
    schemas?: SchemaNode[];
    fetchColumns?: (schemaName: string, tableName: string) => Promise<SqlColumnLike[]>;
    currentSchema?: string;
}

function getModelUriPath(model: { uri?: { path?: string; toString?: () => string } }): string {
    return model?.uri?.path || model?.uri?.toString?.() || '';
}

function makeFilterUriMatcher(model: {
    uri?: { path?: string; toString?: () => string };
}): boolean {
    return getModelUriPath(model).includes(RESULT_FILTER_MODEL_PATH_SEGMENT);
}

// createResultFilterModelPath() returns a full `inmemory://model/...` URI;
// model.uri.path only carries the path portion (`/result-filter/....sql`).
// Normalize so the two can be compared for exact identity below.
function toComparableUriPath(pathOrUri: string): string {
    const schemeEnd = pathOrUri.indexOf('://');
    if (schemeEnd === -1) return pathOrUri;
    const afterScheme = pathOrUri.slice(schemeEnd + 3);
    const pathStart = afterScheme.indexOf('/');
    return pathStart === -1 ? '' : afterScheme.slice(pathStart);
}

// Exported so other 'sql'-language providers (e.g. sqlCompletionProvider.ts,
// the main query editor's provider) can skip these virtual filter-bar
// models — Monaco fires every registered provider for a given language
// regardless of which editor instance owns the model, so without this the
// main editor's schema-wide keyword/column suggestions bleed into the
// filter bar's dropdown alongside this provider's own, correctly-scoped
// ones.
export function isResultFilterModel(model: {
    uri?: { path?: string; toString?: () => string };
}): boolean {
    return makeFilterUriMatcher(model);
}

export function createResultFilterModelPath(key: string): string {
    return `inmemory://model${RESULT_FILTER_MODEL_PATH_SEGMENT}${encodeURIComponent(key)}.sql`;
}

export async function buildResultFilterCompletionItems(
    params: ResultFilterCompletionParams,
): Promise<languages.CompletionItem[]> {
    const result = await buildCompletionPlan(
        {
            sqlText: params.filterText,
            cursorOffset: params.cursorOffset,
            currentWord: params.currentWord,
            range: params.range,
            editorFlavor: 'filter',
            driver: params.driver || '',
            currentSchema: params.currentSchema,
            catalogSnapshot: params.schemas || [],
            templates: [],
            baseQuery: params.baseQuery,
            filterColumns: params.columns,
        },
        {
            fetchColumns: params.fetchColumns || (async () => []),
            fetchRelationships: async () => [],
        },
        createEmptyCompletionMemory(),
    );
    return toMonacoCompletionItems(result, params.monaco);
}

export function registerResultFilterCompletion(
    params: RegisterResultFilterCompletionParams,
): DisposableLike {
    const ownPath = toComparableUriPath(params.modelPath);
    let active = true;
    let latestRequestId = 0;
    const provider: languages.CompletionItemProvider = {
        triggerCharacters: ['.', ',', '('],
        provideCompletionItems: async (model, position, _context, token) => {
            // Every ResultFilterBar registers its own provider (one per open
            // Data tab / result panel, several can stay mounted at once via
            // `hidden` CSS). Without this exact-model check, each provider
            // would answer for every OTHER filter bar's model too — Monaco
            // dispatches by language, not by which editor owns the model —
            // producing duplicated suggestions built from the WRONG
            // baseQuery/schema context.
            if (!ownPath || getModelUriPath(model) !== ownPath) return { suggestions: [] };
            const requestId = ++latestRequestId;
            const shouldAbort = () =>
                !active || requestId !== latestRequestId || Boolean(token?.isCancellationRequested);
            if (shouldAbort()) return { suggestions: [] };

            const filterText = model.getValue();
            const cursorOffset =
                typeof model.getOffsetAt === 'function'
                    ? model.getOffsetAt(position)
                    : filterText.length;
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const result = await buildEditorCompletionPlan({
                sqlText: filterText,
                cursorOffset,
                currentWord: word.word || '',
                range,
                quotedIdentifier: resolveQuotedIdentifier(
                    model.getLineContent(position.lineNumber),
                    range,
                    position.column,
                ),
                editorFlavor: 'filter',
                baseQuery: params.baseQuery,
                filterColumns: params.columns,
                shouldAbort,
            });
            if (shouldAbort()) return { suggestions: [] };
            return { suggestions: toMonacoCompletionItems(result, params.monaco) };
        },
    };

    const registration = params.monaco.languages.registerCompletionItemProvider('sql', provider);
    return {
        dispose: () => {
            active = false;
            latestRequestId += 1;
            registration.dispose();
        },
    };
}
