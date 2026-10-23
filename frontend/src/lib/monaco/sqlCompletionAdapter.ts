// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import type { SqlCompletionRegisterMonacoApi } from './sqlCompletionTypes';
import type { SqlCompletionCandidate, SqlCompletionResult } from './sqlCompletionEngineCore';
import { SQL_COMPLETION_ACCEPTED_COMMAND_ID } from './sqlSuggestionSchemaContext';

function resolveMonacoKind(
    candidate: SqlCompletionCandidate,
    monaco: SqlCompletionRegisterMonacoApi,
): number {
    const kinds = monaco.languages.CompletionItemKind;
    switch (candidate.kind) {
        case 'column':
            return kinds.Field;
        case 'table':
            return kinds.Module;
        case 'view':
            return kinds.Class;
        case 'keyword':
            return kinds.Keyword;
        case 'function':
            return kinds.Function;
        case 'operator':
            return kinds.Operator;
        case 'snippet':
            return kinds.Snippet;
        default:
            return kinds.Text;
    }
}

function makeSortText(candidate: SqlCompletionCandidate, index: number): string {
    return `${String(index).padStart(6, '0')}_${candidate.label.toLowerCase()}`;
}

export function toMonacoCompletionItems(
    result: SqlCompletionResult,
    monaco: SqlCompletionRegisterMonacoApi,
): languages.CompletionItem[] {
    return result.candidates.map((candidate, index) => {
        const tableMeta = candidate.item.__zentroTableMeta as { schemaName?: string } | undefined;
        // candidate.item.insertTextRules comes from the engine core's internal,
        // Monaco-decoupled stand-in API (sqlCompletionEngineCore.ts), whose enum
        // values don't line up with real Monaco's — e.g. its InsertAsSnippet is
        // 1, but real Monaco's is 4 (1 is KeepWhitespace there). Passing the
        // internal value straight through silently disables snippet parsing.
        const insertTextRules = candidate.item.insertTextRules
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined;
        const item: languages.CompletionItem = Object.assign(
            {
                label: candidate.label,
                kind: resolveMonacoKind(candidate, monaco),
                insertText: candidate.item.insertText,
                range: candidate.item.range,
            },
            candidate.item,
            {
                label: candidate.label,
                kind: resolveMonacoKind(candidate, monaco),
                insertText: candidate.item.insertText,
                range: candidate.item.range,
                insertTextRules,
            },
        );
        return Object.assign(item, {
            sortText: makeSortText(candidate, index),
            command: {
                id: SQL_COMPLETION_ACCEPTED_COMMAND_ID,
                title: 'record sql completion acceptance',
                arguments: [
                    {
                        ...candidate.acceptance,
                        schemaName: tableMeta?.schemaName,
                    },
                ],
            },
            __zentroRanking: candidate.ranking,
        });
    });
}
