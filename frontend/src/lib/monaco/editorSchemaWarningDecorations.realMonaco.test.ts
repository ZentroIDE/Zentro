// SPDX-License-Identifier: GPL-3.0-only

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { afterEach, describe, expect, it } from 'vitest';
import { setupSchemaWarningDecorations } from './editorSchemaWarningDecorations';

// Runs against a real Monaco text model: a mocked model cannot show that
// Monaco itself discards the injected text of an empty-range decoration. Only
// the editor is faked (creating a full editor needs canvas, which jsdom lacks);
// its decorations collection writes straight to the real model.
describe('setupSchemaWarningDecorations against a real Monaco model', () => {
    let model: monaco.editor.ITextModel | null = null;

    afterEach(() => {
        model?.dispose();
        model = null;
    });

    const mount = (text: string) => {
        const realModel = monaco.editor.createModel(text, 'sql');
        model = realModel;
        let ids: string[] = [];
        const editor = {
            getModel: () => realModel,
            createDecorationsCollection: () => ({
                set: (decorations: monaco.editor.IModelDeltaDecoration[]) => {
                    ids = realModel.deltaDecorations(ids, decorations);
                },
                clear: () => {
                    ids = realModel.deltaDecorations(ids, []);
                },
            }),
        };
        const manager = setupSchemaWarningDecorations(
            editor as never,
            monaco as never,
            'test-owner',
        );
        return { realModel, manager };
    };

    const warning = {
        startOffset: 7,
        endOffset: 15,
        message: 'full text',
        shortMessage: 'ambiguous',
        severity: 'error' as const,
    };

    it('keeps the end-of-line message in the model when inline messages are on', () => {
        const { realModel, manager } = mount('SELECT order_id\nFROM orders');

        manager.update([warning], true);

        const injected = realModel.getInjectedTextDecorations();
        expect(injected).toHaveLength(1);
        expect(injected[0].options.after?.content).toBe(`\u00a0\u00a0ambiguous`);
        expect(injected[0].range.startLineNumber).toBe(1);
    });

    it('has no injected text when inline messages are off', () => {
        const { realModel, manager } = mount('SELECT order_id\nFROM orders');

        manager.update([warning], false);

        expect(realModel.getInjectedTextDecorations()).toHaveLength(0);
    });

    it('removes the message again after clear()', () => {
        const { realModel, manager } = mount('SELECT order_id\nFROM orders');
        manager.update([warning], true);

        manager.clear();

        expect(realModel.getInjectedTextDecorations()).toHaveLength(0);
    });
});
