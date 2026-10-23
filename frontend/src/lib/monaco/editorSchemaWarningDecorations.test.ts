// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { setupSchemaWarningDecorations, type RangeWarning } from './editorSchemaWarningDecorations';
import type { SqlSchemaWarning } from './sqlSchemaWarnings';

function makeMonaco() {
    return {
        Range: class {
            constructor(
                public startLineNumber: number,
                public startColumn: number,
                public endLineNumber: number,
                public endColumn: number,
            ) {}
        },
        MarkerSeverity: { Warning: 4, Error: 8 },
        editor: { setModelMarkers: vi.fn() },
    };
}

function makeEditor(text: string) {
    const lines = text.split('\n');
    const decorations = { set: vi.fn(), clear: vi.fn() };
    const model = {
        getLineMaxColumn: (lineNumber: number) => (lines[lineNumber - 1]?.length ?? 0) + 1,
        getPositionAt: (offset: number) => {
            let remaining = offset;
            for (let i = 0; i < lines.length; i++) {
                if (remaining <= lines[i].length) {
                    return { lineNumber: i + 1, column: remaining + 1 };
                }
                remaining -= lines[i].length + 1;
            }
            return { lineNumber: lines.length, column: 1 };
        },
    };
    return {
        _decorations: decorations,
        _model: model,
        createDecorationsCollection: vi.fn(() => decorations),
        getModel: vi.fn(() => model),
    };
}

const warning: SqlSchemaWarning = {
    objectName: 'users',
    schemaName: 'public',
    startOffset: 0,
    endOffset: 5,
    message: 'Table "users" not found in schema "public"',
};

describe('setupSchemaWarningDecorations', () => {
    it('sets both model markers and inline decorations for each warning', () => {
        const editor = makeEditor('users.id');
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner-1');

        manager.update([warning]);

        expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(editor._model, 'owner-1', [
            expect.objectContaining({ message: warning.message, source: 'schema-context' }),
        ]);
        expect(editor._decorations.set).toHaveBeenCalledWith([
            expect.objectContaining({
                options: expect.objectContaining({
                    inlineClassName: 'zentro-schema-warning-token',
                    hoverMessage: { value: warning.message },
                }),
            }),
        ]);
    });

    it('labels the markers with a custom source when one is given', () => {
        const editor = makeEditor('users.id');
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner-2', {
            source: 'column-check',
        });

        manager.update([warning]);

        expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(editor._model, 'owner-2', [
            expect.objectContaining({ source: 'column-check' }),
        ]);
    });

    it('marks errors as errors, with their own squiggle class', () => {
        const editor = makeEditor('users.id');
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner-3');

        manager.update([{ ...warning, severity: 'error' }, warning]);

        expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(editor._model, 'owner-3', [
            expect.objectContaining({ severity: 8 }),
            expect.objectContaining({ severity: 4 }),
        ]);
        expect(editor._decorations.set).toHaveBeenCalledWith([
            expect.objectContaining({
                options: expect.objectContaining({ inlineClassName: 'zentro-schema-error-token' }),
            }),
            expect.objectContaining({
                options: expect.objectContaining({
                    inlineClassName: 'zentro-schema-warning-token',
                }),
            }),
        ]);
    });

    it('clears markers and decorations when given an empty warnings list', () => {
        const editor = makeEditor('users.id');
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner-1');

        manager.update([warning]);
        manager.update([]);

        expect(monaco.editor.setModelMarkers).toHaveBeenLastCalledWith(
            editor._model,
            'owner-1',
            [],
        );
        expect(editor._decorations.clear).toHaveBeenCalledTimes(1);
    });

    it('clear() clears markers and decorations directly', () => {
        const editor = makeEditor('users.id');
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner-1');

        manager.clear();

        expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(editor._model, 'owner-1', []);
        expect(editor._decorations.clear).toHaveBeenCalledTimes(1);
    });
});

// The message is set off from the code by two non-breaking spaces (see INLINE_MESSAGE_GAP).
const GAP = '\u00a0\u00a0';

interface InlineDecoration {
    range: { startLineNumber: number; startColumn: number };
    options: {
        isWholeLine?: boolean;
        showIfCollapsed?: boolean;
        className?: string;
        after?: { content: string; inlineClassName: string };
    };
}

describe('setupSchemaWarningDecorations: inline messages', () => {
    const text = 'SELECT a,\n    b,\n    c FROM t';
    const at = (needle: string) => text.indexOf(needle);
    const warnAt = (needle: string, overrides: Partial<RangeWarning> = {}): RangeWarning => ({
        startOffset: at(needle),
        endOffset: at(needle) + needle.length,
        message: `full message for ${needle}`,
        ...overrides,
    });
    const setup = () => {
        const editor = makeEditor(text);
        const monaco = makeMonaco();
        const manager = setupSchemaWarningDecorations(editor as never, monaco as never, 'owner');
        const inlineOf = () =>
            (editor._decorations.set.mock.calls.at(-1)?.[0] as InlineDecoration[]).filter(
                decoration => decoration.options.after,
            );
        return { manager, inlineOf, editor };
    };

    it('shows nothing at the end of the line unless asked to', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b')]);

        expect(inlineOf()).toEqual([]);
    });

    it('writes the message after the code and tints the whole line', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b', { severity: 'error' })], true);

        const [inline] = inlineOf();
        expect(inline.range).toMatchObject({
            startLineNumber: 2,
            startColumn: '    b,'.length + 1,
        });
        expect(inline.options).toMatchObject({
            isWholeLine: true,
            // Without it Monaco discards the text of an empty-range decoration.
            showIfCollapsed: true,
            className: 'zentro-error-lens-line-error',
            after: {
                content: `${GAP}full message for b`,
                inlineClassName: 'zentro-error-lens-message-error',
            },
        });
    });

    it('prefers the short message for the end of the line', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b', { shortMessage: 'short' })], true);

        expect(inlineOf()[0].options.after?.content).toBe(`${GAP}short`);
    });

    it('uses the warning styling for warnings', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b')], true);

        expect(inlineOf()[0].options.className).toBe('zentro-error-lens-line-warning');
        expect(inlineOf()[0].options.after?.inlineClassName).toBe(
            'zentro-error-lens-message-warning',
        );
    });

    it('shows one message per line, the most severe one', () => {
        const { manager, inlineOf } = setup();

        manager.update(
            [
                warnAt('a'),
                { ...warnAt('SELECT'), severity: 'error' as const, message: 'the error' },
                warnAt('c'),
            ],
            true,
        );

        const inline = inlineOf();
        expect(inline.map(entry => entry.range.startLineNumber)).toEqual([1, 3]);
        expect(inline[0].options.after?.content).toBe(`${GAP}the error`);
    });

    it('keeps the first message when severities tie', () => {
        const { manager, inlineOf } = setup();

        manager.update(
            [warnAt('SELECT', { message: 'first' }), warnAt('a', { message: 'second' })],
            true,
        );

        expect(inlineOf()).toHaveLength(1);
        expect(inlineOf()[0].options.after?.content).toBe(`${GAP}first`);
    });

    it('cuts a very long message', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b', { message: 'x'.repeat(400) })], true);

        const content = inlineOf()[0].options.after?.content ?? '';
        expect(content.length).toBeLessThanOrEqual(160 + GAP.length);
        expect(content.endsWith('…')).toBe(true);
    });

    it('still marks every warning with a squiggle and a marker', () => {
        const { manager, editor } = setup();

        manager.update([warnAt('a'), warnAt('c')], true);

        const decorations = editor._decorations.set.mock.calls.at(-1)?.[0] as unknown[];
        expect(decorations).toHaveLength(4);
    });

    it('removes the messages again when turned off', () => {
        const { manager, inlineOf } = setup();

        manager.update([warnAt('b')], true);
        manager.update([warnAt('b')], false);

        expect(inlineOf()).toEqual([]);
    });
});
