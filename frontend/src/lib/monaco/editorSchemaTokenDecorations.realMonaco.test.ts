// SPDX-License-Identifier: GPL-3.0-only

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { afterEach, describe, expect, it } from 'vitest';
import type { SchemaNode } from '../../stores/schemaStore';
import { setupSchemaTokenDecorations } from './editorSchemaTokenDecorations';
import { collectSqlSchemaTokens } from './sqlSchemaTokens';

// A real Monaco model, so the decoration ranges are the ones Monaco will render
// (only the editor is faked: a full editor needs canvas).
describe('schema-name decorations', () => {
    let model: monaco.editor.ITextModel | null = null;
    afterEach(() => {
        model?.dispose();
        model = null;
    });

    const schemas: SchemaNode[] = [
        { Name: 'public', Tables: ['order_details', 'orders', 'customers'], Views: [] },
    ];

    it('puts the table class on every table name of a multi-line script', () => {
        const text =
            'SELECT od.order_id FROM order_details od INNER JOIN public.orders o ON od.order_id = o.order_id;\n\nSELECT *\nFROM customers c2;';
        const realModel = monaco.editor.createModel(text, 'sql');
        model = realModel;
        let ids: string[] = [];
        const editor = {
            getModel: () => realModel,
            deltaDecorations: (old: string[], next: monaco.editor.IModelDeltaDecoration[]) => {
                ids = realModel.deltaDecorations(old.length ? old : ids, next);
                return ids;
            },
        };
        const manager = setupSchemaTokenDecorations(editor as never, monaco as never);

        manager.update(collectSqlSchemaTokens(text, { schemas, currentSchema: 'public' }));

        const byClass = (className: string) =>
            realModel
                .getAllDecorations()
                .filter(decoration => decoration.options.inlineClassName === className)
                .map(decoration => realModel.getValueInRange(decoration.range));
        expect(byClass('zentro-sql-table').sort()).toEqual([
            'customers',
            'order_details',
            'orders',
        ]);
        expect(byClass('zentro-sql-alias').sort()).toEqual(
            expect.arrayContaining(['c2', 'o', 'od']),
        );
    });
});
