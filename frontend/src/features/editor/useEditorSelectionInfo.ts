// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
    computeSelectionInfo,
    EMPTY_SELECTION_INFO,
    selectionInfoEquals,
    type SelectionInfo,
} from './editorSelectionInfo';

// Cursor/selection events fire per keystroke and per drag step; coalesce them
// to one React update per frame so the status strip never competes with typing.
export function useEditorSelectionInfo(
    editor: MonacoEditor.IStandaloneCodeEditor | null,
): SelectionInfo {
    const [info, setInfo] = useState<SelectionInfo>(EMPTY_SELECTION_INFO);

    useEffect(() => {
        if (!editor) return;
        let frame = 0;

        const update = () => {
            frame = 0;
            const model = editor.getModel();
            if (!model) return;
            const next = computeSelectionInfo(
                model,
                editor.getSelections() ?? [],
                editor.getPosition(),
            );
            setInfo(prev => (selectionInfoEquals(prev, next) ? prev : next));
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };

        update();
        const disposable = editor.onDidChangeCursorSelection(schedule);
        return () => {
            disposable.dispose();
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [editor]);

    return info;
}
