// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';
import type { SchemaTokenSpan } from './sqlSchemaTokens';

type MonacoInstance = Parameters<OnMount>[1];

const CLASS_BY_KIND = {
    table: 'zentro-sql-table',
    column: 'zentro-sql-column',
    alias: 'zentro-sql-alias',
} as const;

/**
 * Draws schema-aware names (tables, columns, aliases) as inline decorations.
 * Colours live in CSS, so a settings change needs no re-decoration; callers
 * only push new spans when the text or schema changes.
 */
export function setupSchemaTokenDecorations(
    editorInstance: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
): { update: (spans: SchemaTokenSpan[]) => void; clear: () => void } {
    let decorationIds: string[] = [];

    const clear = () => {
        decorationIds = editorInstance.deltaDecorations(decorationIds, []);
    };

    const update = (spans: SchemaTokenSpan[]) => {
        const model = editorInstance.getModel();
        if (!model || spans.length === 0) {
            clear();
            return;
        }
        decorationIds = editorInstance.deltaDecorations(
            decorationIds,
            spans.map(span => {
                const start = model.getPositionAt(span.startOffset);
                const end = model.getPositionAt(span.endOffset);
                return {
                    range: new monaco.Range(
                        start.lineNumber,
                        start.column,
                        end.lineNumber,
                        end.column,
                    ),
                    options: { inlineClassName: CLASS_BY_KIND[span.kind] },
                };
            }),
        );
    };

    return { update, clear };
}
