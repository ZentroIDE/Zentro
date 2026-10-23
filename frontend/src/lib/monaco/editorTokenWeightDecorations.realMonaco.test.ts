// SPDX-License-Identifier: GPL-3.0-only

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installSqlTokenizer } from './sqlLanguage';
import { SEMIBOLD_CLASS, setupTokenWeightDecorations } from './editorTokenWeightDecorations';

// Against a real model and the real Zentro grammar, so the ranges are the ones
// Monaco would really trim. Only the editor is faked (a full editor needs canvas).
describe('setupTokenWeightDecorations', () => {
    let model: monaco.editor.ITextModel | null = null;

    beforeAll(() => {
        (window as unknown as { matchMedia?: unknown }).matchMedia ??= () => ({
            matches: false,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
        });
        monaco.languages.register({ id: 'sql' });
        installSqlTokenizer(monaco as never);
    });

    afterEach(() => {
        model?.dispose();
        model = null;
    });

    const mount = (text: string) => {
        const realModel = monaco.editor.createModel(text, 'sql');
        model = realModel;
        let ids: string[] = [];
        const listeners: (() => void)[] = [];
        const editor = {
            getModel: () => realModel,
            onDidChangeModelContent: (listener: () => void) => {
                listeners.push(listener);
                return { dispose: () => listeners.splice(listeners.indexOf(listener), 1) };
            },
            createDecorationsCollection: () => ({
                set: (decorations: monaco.editor.IModelDeltaDecoration[]) => {
                    ids = realModel.deltaDecorations(ids, decorations);
                },
                clear: () => {
                    ids = realModel.deltaDecorations(ids, []);
                },
            }),
        };
        const manager = setupTokenWeightDecorations(editor as never, monaco as never);
        const decorated = () =>
            realModel
                .getAllDecorations()
                .filter(decoration => decoration.options.inlineClassName === SEMIBOLD_CLASS)
                .map(decoration => realModel.getValueInRange(decoration.range));
        return { manager, decorated };
    };

    it('decorates only the tokens of the requested categories', () => {
        const { manager, decorated } = mount("SELECT a, COUNT(*) FROM t WHERE x = 'y'");
        manager.update(['keyword']);
        expect(decorated().sort()).toEqual(['FROM', 'SELECT', 'WHERE']);
        manager.update(['function', 'string']);
        expect(decorated().sort()).toEqual(["'y'", 'COUNT']);
    });

    it('covers a token that ends a line', () => {
        const { manager, decorated } = mount('SELECT 1\nFROM t\nWHERE');
        manager.update(['keyword']);
        expect(decorated().sort()).toEqual(['FROM', 'SELECT', 'WHERE']);
    });

    it('removes everything when no category is left', () => {
        const { manager, decorated } = mount('SELECT 1');
        manager.update(['keyword']);
        expect(decorated()).toHaveLength(1);
        manager.update([]);
        expect(decorated()).toHaveLength(0);
    });

    it('does nothing for a category with no tokens', () => {
        const { manager, decorated } = mount('SELECT 1');
        manager.update(['table']);
        expect(decorated()).toEqual([]);
    });
});
