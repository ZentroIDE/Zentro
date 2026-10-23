// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

type MonacoInstance = Parameters<OnMount>[1];

export interface BookmarkLike {
    line: number;
}

/** Renders bookmark gutter/line decorations. Uses the older
 *  `deltaDecorations` id-tracking API (matching the pre-extraction code)
 *  rather than `createDecorationsCollection`, since that's what the
 *  bookmark decorations already used. */
export function setupBookmarkDecorations(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
): { update: (bookmarks: BookmarkLike[]) => void; clear: () => void } {
    let decorationIds: string[] = [];

    const update = (bookmarks: BookmarkLike[]) => {
        const next = bookmarks.map(bookmark => ({
            range: new monaco.Range(bookmark.line, 1, bookmark.line, 1),
            options: {
                isWholeLine: true,
                className: 'zentro-bookmark-line',
                marginClassName: 'zentro-bookmark-margin',
            },
        }));
        decorationIds = editor.deltaDecorations(decorationIds, next);
    };

    return {
        update,
        clear: () => update([]),
    };
}
