// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { toMonacoCompletionItems } from './sqlCompletionAdapter';
import { SQL_COMPLETION_ACCEPTED_COMMAND_ID } from './sqlSuggestionSchemaContext';

describe('sqlCompletionAdapter', () => {
    it('maps semantic candidates and attaches acceptance metadata', () => {
        const monaco = {
            languages: {
                CompletionItemKind: {
                    Field: 1,
                    Module: 2,
                    Class: 3,
                    Keyword: 4,
                    Function: 5,
                    Text: 6,
                    Operator: 7,
                    Snippet: 8,
                },
                CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
            },
        };
        const items = toMonacoCompletionItems(
            {
                context: {
                    clause: 'from',
                    editorFlavor: 'main',
                    contextBucket: 'from|main|postgres|public|',
                    sourceSignature: '',
                },
                candidates: [
                    {
                        label: 'users',
                        kind: 'table',
                        item: {
                            label: 'users',
                            insertText: 'users',
                            range: {
                                startLineNumber: 1,
                                endLineNumber: 1,
                                startColumn: 1,
                                endColumn: 1,
                            },
                            __zentroTableMeta: { schemaName: 'public' },
                        },
                        acceptance: {
                            suggestionKey: 'users',
                            suggestionKind: 'table',
                            contextBucket: 'from|main|postgres|public|',
                        },
                        ranking: {
                            baseScore: 10,
                            semanticBoost: 0,
                            prefixBoost: 0,
                            adaptiveBoost: 0,
                            finalScore: 10,
                            reasons: ['clause:from'],
                        },
                    },
                ],
            },
            monaco as any,
        );

        expect(items[0].kind).toBe(2);
        expect(items[0].command).toEqual({
            id: SQL_COMPLETION_ACCEPTED_COMMAND_ID,
            title: 'record sql completion acceptance',
            arguments: [
                expect.objectContaining({
                    suggestionKey: 'users',
                    schemaName: 'public',
                }),
            ],
        });
    });

    it('preserves engine ranking when Monaco sorts items lexicographically', () => {
        const monaco = {
            languages: {
                CompletionItemKind: {
                    Field: 1,
                    Module: 2,
                    Class: 3,
                    Keyword: 4,
                    Function: 5,
                    Text: 6,
                    Operator: 7,
                    Snippet: 8,
                },
                CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
            },
        };
        const range = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 15,
            endColumn: 15,
        };
        const acceptance = {
            suggestionKey: 'candidate',
            suggestionKind: 'table' as const,
            contextBucket: 'from|main|postgres|public|',
        };
        const items = toMonacoCompletionItems(
            {
                context: {
                    clause: 'from',
                    editorFlavor: 'main',
                    contextBucket: acceptance.contextBucket,
                    sourceSignature: '',
                },
                candidates: [
                    {
                        label: 'categories',
                        kind: 'table',
                        item: { label: 'categories', insertText: 'categories', range },
                        acceptance,
                        ranking: {
                            baseScore: 130,
                            semanticBoost: 400,
                            prefixBoost: 0,
                            adaptiveBoost: 0,
                            finalScore: 530,
                            reasons: ['table-target'],
                        },
                    },
                    {
                        label: 'AS',
                        kind: 'keyword',
                        item: { label: 'AS', insertText: 'AS ', range },
                        acceptance: {
                            ...acceptance,
                            suggestionKey: 'as',
                            suggestionKind: 'keyword',
                        },
                        ranking: {
                            baseScore: -130,
                            semanticBoost: 0,
                            prefixBoost: 0,
                            adaptiveBoost: 0,
                            finalScore: -130,
                            reasons: ['clause:from'],
                        },
                    },
                ],
            },
            monaco as any,
        );

        const monacoOrderedLabels = items
            .slice()
            .sort((left, right) => String(left.sortText).localeCompare(String(right.sortText)))
            .map(item => String(item.label));
        expect(monacoOrderedLabels).toEqual(['categories', 'AS']);
    });
    it('passes additional text edits through so the Monaco item applies them together', () => {
        const monaco = {
            languages: {
                CompletionItemKind: { Field: 1, Module: 2, Class: 3, Keyword: 4, Function: 5 },
            },
        };
        const range = { startLineNumber: 1, endLineNumber: 1, startColumn: 8, endColumn: 11 };
        const joinEdit = {
            range: { startLineNumber: 1, endLineNumber: 1, startColumn: 27, endColumn: 27 },
            text: ' LEFT JOIN dbo.Orders o ON c.Id = o.CustomerId',
        };

        const [item] = toMonacoCompletionItems(
            {
                context: {
                    clause: 'select',
                    editorFlavor: 'main',
                    contextBucket: 'select|main|sqlserver|dbo|',
                    sourceSignature: '',
                },
                candidates: [
                    {
                        label: 'o.OrderDate',
                        kind: 'column',
                        item: {
                            label: 'o.OrderDate',
                            insertText: 'o.OrderDate',
                            range,
                            additionalTextEdits: [joinEdit],
                        },
                        acceptance: {
                            suggestionKey: 'o.orderdate',
                            suggestionKind: 'column',
                            contextBucket: 'select|main|sqlserver|dbo|',
                        },
                        ranking: {
                            baseScore: 1,
                            semanticBoost: 0,
                            prefixBoost: 0,
                            adaptiveBoost: 0,
                            finalScore: 1,
                            reasons: [],
                        },
                    },
                ],
            },
            monaco as never,
        );

        expect(item.additionalTextEdits).toEqual([joinEdit]);
    });
});
