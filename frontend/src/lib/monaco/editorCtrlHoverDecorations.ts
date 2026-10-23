// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';
import type { SchemaNode } from '../../stores/schemaStore';
import { resolveTableNavigationAtPosition } from './sqlTableNavigation';

type MonacoInstance = Parameters<OnMount>[1];
type EditorPosition = Parameters<editor.IStandaloneCodeEditor['setPosition']>[0];

/** Self-subscribing: tracks Ctrl/Cmd + hover over a navigable table/view
 *  reference and underlines it. Mirrors `setupRiskHighlight`'s
 *  self-driving shape — callers just call `dispose()` on unmount, no
 *  `update()` needed since mouse/keyboard events drive it internally.
 *  `getSchemas` is called on each hover to resolve the schema list for
 *  the currently active connection; returning `null` (no active
 *  connection) clears the decoration. */
export function setupCtrlHoverDecorations(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
    getSchemas: () => SchemaNode[] | null,
): { dispose: () => void } {
    let decorationIds: string[] = [];
    let lastHoverPosition: EditorPosition | null = null;
    let modifierPressed = false;

    const clear = () => {
        decorationIds = editor.deltaDecorations(decorationIds, []);
    };

    const apply = (position: EditorPosition | null) => {
        if (!position || !modifierPressed) {
            clear();
            return;
        }

        const model = editor.getModel();
        const schemas = model ? getSchemas() : null;
        if (!model || !schemas) {
            clear();
            return;
        }

        const navigation = resolveTableNavigationAtPosition(model, position, schemas);
        if (navigation.kind === 'not_found') {
            clear();
            return;
        }

        const word = model.getWordAtPosition(position);
        if (!word) {
            clear();
            return;
        }

        const range = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
        );

        decorationIds = editor.deltaDecorations(decorationIds, [
            { range, options: { inlineClassName: 'zentro-table-nav-hover' } },
        ]);
    };

    const mouseMoveDisposable = editor.onMouseMove(e => {
        const targetType = e?.target?.type;
        const mt = monaco.editor.MouseTargetType;
        if (targetType !== mt.CONTENT_TEXT) {
            lastHoverPosition = null;
            clear();
            return;
        }
        const browserEvent = e?.event?.browserEvent as MouseEvent | undefined;
        modifierPressed = Boolean(browserEvent?.ctrlKey || browserEvent?.metaKey);
        lastHoverPosition = e?.target?.position || null;
        apply(lastHoverPosition);
    });

    const mouseLeaveDisposable = editor.onMouseLeave(() => {
        lastHoverPosition = null;
        clear();
    });

    const blurDisposable = editor.onDidBlurEditorWidget(() => {
        clear();
    });

    const handleModifierKey = (event: KeyboardEvent) => {
        const nextPressed = Boolean(event.ctrlKey || event.metaKey);
        if (nextPressed === modifierPressed) return;
        modifierPressed = nextPressed;
        if (!modifierPressed) {
            clear();
            return;
        }
        apply(lastHoverPosition);
    };

    window.addEventListener('keydown', handleModifierKey, true);
    window.addEventListener('keyup', handleModifierKey, true);

    return {
        dispose: () => {
            window.removeEventListener('keydown', handleModifierKey, true);
            window.removeEventListener('keyup', handleModifierKey, true);
            mouseMoveDisposable.dispose();
            mouseLeaveDisposable.dispose();
            blurDisposable.dispose();
            clear();
        },
    };
}
