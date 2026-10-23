// SPDX-License-Identifier: GPL-3.0-only

import type { DraftRow } from '../../../../lib/dataEditing';
import {
    applyClipboardPaste,
    applySetNullToSelection,
} from '../../../../features/editor/resultSelectionActions';

export interface ContextMenuSnapshot {
    editedCells: Map<string, string>;
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    selectedCells: Set<string>;
}

export function buildPasteResult(args: {
    text: string;
    selectedCells: Set<string>;
    displayRows: Parameters<typeof applyClipboardPaste>[0]['displayRows'];
    rowOrder: Parameters<typeof applyClipboardPaste>[0]['rowOrder'];
    editedCells: Parameters<typeof applyClipboardPaste>[0]['editedCells'];
    draftRows: DraftRow[];
    deletedRows: Set<number>;
    columnCount: number;
    mode?: Parameters<typeof applyClipboardPaste>[0]['mode'];
    blurredColumnIndexes?: ReadonlySet<number>;
}) {
    return applyClipboardPaste(args);
}

export function buildSetNullResult(args: {
    selectedCells: Set<string>;
    displayRowsByKey: Parameters<typeof applySetNullToSelection>[0]['displayRowsByKey'];
    editedCells: Parameters<typeof applySetNullToSelection>[0]['editedCells'];
    draftRows: DraftRow[];
    nullableByColumnIndex: boolean[];
    blurredColumnIndexes?: ReadonlySet<number>;
}) {
    return applySetNullToSelection(args);
}
