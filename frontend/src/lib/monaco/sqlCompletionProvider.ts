// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import { getOffsetAtPosition } from './sqlCompletionBuilderUtils';
import { isResultFilterModel } from './resultFilterCompletion';
import { DisposableLike, SqlCompletionRegisterMonacoApi } from './sqlCompletionTypes';
import { toMonacoCompletionItems } from './sqlCompletionAdapter';
import { resolveQuotedIdentifier } from './sqlCompletionIdentifiers';
import { readLineIndent } from './sqlSelectListFormat';
import {
    buildEditorCompletionPlan,
    resolveEditorCompletionItem,
} from './sqlCompletionOrchestrator';

const REGISTRY_KEY = '__ZENTRO_SQL_COMPLETION_PROVIDER_REGISTRY__';
const REGISTRY_COUNTER_KEY = '__ZENTRO_SQL_COMPLETION_PROVIDER_COUNTER__';
const MONACO_ID_KEY = '__ZENTRO_SQL_COMPLETION_MONACO_ID__';

interface SqlCompletionProviderRegistration {
    active: boolean;
    generation: number;
    refCount: number;
    registration: DisposableLike;
    requestIdsByModel: WeakMap<object, number>;
    fallbackRequestId: number;
}

type SqlCompletionGlobal = typeof globalThis & {
    [REGISTRY_KEY]?: Map<string, SqlCompletionProviderRegistration>;
    [REGISTRY_COUNTER_KEY]?: number;
};

type SqlCompletionMonacoTarget = SqlCompletionRegisterMonacoApi & {
    [MONACO_ID_KEY]?: string;
};

function getSqlCompletionRegistry(): Map<string, SqlCompletionProviderRegistration> {
    const g = globalThis as SqlCompletionGlobal;
    if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map<string, SqlCompletionProviderRegistration>();
    return g[REGISTRY_KEY];
}

function getMonacoRegistrationId(monaco: SqlCompletionRegisterMonacoApi): string {
    const target = monaco as SqlCompletionMonacoTarget;
    if (target[MONACO_ID_KEY]) return target[MONACO_ID_KEY]!;
    const g = globalThis as SqlCompletionGlobal;
    const nextId = (g[REGISTRY_COUNTER_KEY] ?? 0) + 1;
    g[REGISTRY_COUNTER_KEY] = nextId;
    target[MONACO_ID_KEY] = `sql-completion-${nextId}`;
    return target[MONACO_ID_KEY]!;
}

function nextRequestIdForModel(
    provider: SqlCompletionProviderRegistration,
    model: unknown,
): number {
    if (model && typeof model === 'object') {
        const key = model as object;
        const nextId = (provider.requestIdsByModel.get(key) ?? 0) + 1;
        provider.requestIdsByModel.set(key, nextId);
        return nextId;
    }
    provider.fallbackRequestId += 1;
    return provider.fallbackRequestId;
}

function getLatestRequestIdForModel(
    provider: SqlCompletionProviderRegistration,
    model: unknown,
): number {
    if (model && typeof model === 'object') {
        return provider.requestIdsByModel.get(model as object) ?? 0;
    }
    return provider.fallbackRequestId;
}

function disposeProviderRegistration(provider: SqlCompletionProviderRegistration): void {
    provider.active = false;
    provider.generation += 1;
    try {
        provider.registration.dispose();
    } catch (error) {
        console.error('Error disposing SQL completion provider:', error);
    }
}

function createProviderRegistration(
    monaco: SqlCompletionRegisterMonacoApi,
): SqlCompletionProviderRegistration {
    const provider: Partial<SqlCompletionProviderRegistration> = {
        active: true,
        generation: 0,
        refCount: 0,
        requestIdsByModel: new WeakMap<object, number>(),
        fallbackRequestId: 0,
    };

    const completionProvider: languages.CompletionItemProvider = {
        triggerCharacters: ['.', ',', '(', '@', '#'],
        provideCompletionItems: async (model, position, _context, token) => {
            // The WHERE/ORDER BY filter bar (ResultFilterBar) registers its
            // own scoped provider for these virtual models — skip them here
            // so this provider's schema-wide, baseQuery-unaware suggestions
            // don't get merged into the filter bar's dropdown.
            if (isResultFilterModel(model)) return { suggestions: [] };
            const generation = provider.generation ?? 0;
            const requestId = nextRequestIdForModel(
                provider as SqlCompletionProviderRegistration,
                model,
            );
            const shouldAbort = () =>
                !provider.active ||
                Boolean(token?.isCancellationRequested) ||
                (provider.generation ?? 0) !== generation ||
                getLatestRequestIdForModel(provider as SqlCompletionProviderRegistration, model) !==
                    requestId;
            if (shouldAbort()) return { suggestions: [] };
            const fullText = model.getValue();
            const cursorOffset =
                typeof model.getOffsetAt === 'function'
                    ? model.getOffsetAt(position)
                    : getOffsetAtPosition(fullText, position);
            const word = model.getWordUntilPosition(position);
            const lineText = model.getLineContent(position.lineNumber);
            // Monaco's word pattern stops at '@' / '#', but T-SQL variables and
            // temp tables include them: widen the range and the word to match.
            const sigil = word.startColumn > 1 ? lineText[word.startColumn - 2] : '';
            const hasSigil = sigil === '@' || sigil === '#';
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: hasSigil ? word.startColumn - 1 : word.startColumn,
                endColumn: word.endColumn,
            };
            const quotedIdentifier = resolveQuotedIdentifier(lineText, range, position.column);
            const result = await buildEditorCompletionPlan({
                sqlText: fullText,
                cursorOffset,
                currentWord: hasSigil ? `${sigil}${word.word || ''}` : word.word || '',
                range,
                quotedIdentifier,
                lineIndent: readLineIndent(lineText),
                positionAt: offset => model.getPositionAt(offset),
                editorFlavor: 'main',
                shouldAbort,
            });
            if (shouldAbort()) return { suggestions: [] };
            return { suggestions: toMonacoCompletionItems(result, monaco) };
        },
        resolveCompletionItem: async (item, token) => {
            const shouldAbort = () => !provider.active || Boolean(token?.isCancellationRequested);
            return resolveEditorCompletionItem(item, shouldAbort);
        },
    };

    provider.registration = monaco.languages.registerCompletionItemProvider(
        'sql',
        completionProvider,
    );
    return provider as SqlCompletionProviderRegistration;
}

export function registerContextAwareSQLCompletion(
    monaco: SqlCompletionRegisterMonacoApi,
): DisposableLike {
    const registry = getSqlCompletionRegistry();
    const monacoId = getMonacoRegistrationId(monaco);
    let provider = registry.get(monacoId);
    if (!provider || !provider.active) {
        provider = createProviderRegistration(monaco);
        registry.set(monacoId, provider);
    }

    provider.refCount += 1;
    let disposed = false;

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            if (!provider) return;
            provider.refCount = Math.max(0, provider.refCount - 1);
            if (provider.refCount > 0 || !provider.active) return;
            disposeProviderRegistration(provider);
            registry.delete(monacoId);
        },
    };
}

export function disposeSqlCompletionProviders(monaco?: SqlCompletionRegisterMonacoApi): void {
    const registry = getSqlCompletionRegistry();
    if (monaco) {
        const provider = registry.get(getMonacoRegistrationId(monaco));
        if (!provider || !provider.active) return;
        provider.refCount = 0;
        disposeProviderRegistration(provider);
        registry.delete(getMonacoRegistrationId(monaco));
        return;
    }

    registry.forEach((provider, key) => {
        if (!provider.active) return;
        provider.refCount = 0;
        disposeProviderRegistration(provider);
        registry.delete(key);
    });
}
