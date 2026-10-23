// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { DraftRow } from '../../lib/dataEditing';
import { useToast } from '../../components/layout/Toast';
import { getClipboardText, setClipboardText } from '../../services/clipboardService';
import { BLURRED_COPY_MESSAGE, blurredEditSkippedMessage } from '../../lib/blurredColumns';
import { switchTabRelative } from '../../lib/shortcutRegistry';
import {
    applyClipboardPaste,
    buildRowSelectionMatrix,
    buildSelectionMatrix,
    matrixToTsv,
    selectionTouchesBlurredColumn,
} from './resultSelectionActions';

interface UseResultKeyboardOptions {
    tabId: string;
    result:
        | {
              columns: string[];
              rows: string[][];
              isDone: boolean;
              isSelect: boolean;
          }
        | undefined;
    hasPendingChanges: boolean;
    viewMode: boolean;
    isEditable: boolean;
    selectedCells: Set<string>;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRowKeys: string[];
    displayRows: Array<{
        key: string;
        kind: 'persisted' | 'draft';
        persistedIndex?: number | null;
        values: string[];
        draft?: { id: string } | null;
    }>;
    displayRowsByKey: Map<
        string,
        {
            key: string;
            kind: 'persisted' | 'draft';
            persistedIndex?: number | null;
            values: string[];
            draft?: { id: string } | null;
        }
    >;
    rowOrder: Map<string, number>;
    editedCells: Map<string, string>;
    deletedRows: Set<number>;
    draftRows: DraftRow[];
    isSavingDraftRows: boolean;
    blurredColumnIndexes?: ReadonlySet<number>;
    onRun?: () => void;
    onSaveRequest: () => Promise<void> | void;
    onDeleteSelected: () => void;
    onUndoLastAction?: () => void;
    onSetShowRightSidebar: (show: boolean) => void;
    onFocusSearch?: () => void;
    onFocusJump?: () => void;
    onSearchNext?: () => void;
    onSearchPrev?: () => void;
    setEditedCells: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setDraftRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
}

/**
 * Returns an `onKeyDown` handler for the ResultPanel container div.
 * Handles: F5 re-run, Tab double-tap to open row detail, Delete rows,
 * Ctrl+S save, Ctrl+C copy matrix, Ctrl+V paste matrix.
 */
export function useResultKeyboard({
    result,
    hasPendingChanges,
    viewMode,
    isEditable,
    selectedCells,
    setSelectedCells,
    selectedRowKeys,
    displayRows,
    displayRowsByKey,
    rowOrder,
    editedCells,
    deletedRows,
    draftRows,
    isSavingDraftRows,
    blurredColumnIndexes,
    onRun,
    onSaveRequest,
    onDeleteSelected,
    onUndoLastAction,
    onSetShowRightSidebar,
    onFocusSearch,
    onFocusJump,
    onSearchNext,
    onSearchPrev,
    setEditedCells,
    setDraftRows,
}: UseResultKeyboardOptions) {
    const lastTabTime = React.useRef(0);
    const { toast } = useToast();
    const isTextEntryContext = React.useCallback((target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return false;
        if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
        )
            return true;
        if (target.isContentEditable) return true;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
            return true;
        if (target.closest('.monaco-editor, .zentro-filter-monaco, .monaco-inputbox')) return true;
        return false;
    }, []);

    const handleKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (isTextEntryContext(event.target)) return;
            if (isTextEntryContext(document.activeElement)) return;
            if (!result) return;

            // F5 — reload. The host's onRun owns the pending-changes / read-only guard.
            if (event.key === 'F5') {
                event.preventDefault();
                event.stopPropagation();
                onRun?.();
                return;
            }

            // Tab (double) — open row detail sidebar
            if (event.key === 'Tab') {
                if (selectedCells.size > 0 && result.columns.length > 0) {
                    event.preventDefault();
                    const now = Date.now();
                    if (now - lastTabTime.current < 400) {
                        const activeRowKey = selectedRowKeys[0];
                        if (activeRowKey && displayRowsByKey.get(activeRowKey)) {
                            onSetShowRightSidebar(true);
                        }
                        lastTabTime.current = 0;
                    } else {
                        lastTabTime.current = now;
                    }
                }
                return;
            }

            // Delete / Backspace+Ctrl — delete rows. Dragging a selection in
            // the index column populates selectedRowKeys and clears
            // selectedCells (see handleRowHeaderMouseDown), so checking only
            // selectedCells left row-header-only selections unable to
            // delete via keyboard even though the same onDeleteSelected
            // handler (shared with the context menu's Delete) already reads
            // selectedRowKeys just fine.
            if (
                event.key === 'Delete' ||
                (event.key === 'Backspace' && (event.ctrlKey || event.metaKey))
            ) {
                if (viewMode || (selectedCells.size === 0 && selectedRowKeys.length === 0)) return;
                event.preventDefault();
                onDeleteSelected();
                return;
            }

            // Ctrl+S — save
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                if (viewMode || !hasPendingChanges || isSavingDraftRows) return;
                event.preventDefault();
                void onSaveRequest();
                return;
            }

            // Ctrl+Z — undo last grid/context action
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                if (!onUndoLastAction) return;
                event.preventDefault();
                onUndoLastAction();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                onFocusSearch?.();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                onFocusJump?.();
                return;
            }

            if (event.key === 'F3') {
                event.preventDefault();
                if (event.shiftKey) onSearchPrev?.();
                else onSearchNext?.();
                return;
            }

            // Ctrl+PageUp/PageDown — next/prev result tab, reusing the same
            // tab-cycling logic as editor.nextTab/editor.prevTab (G1).
            if (
                (event.ctrlKey || event.metaKey) &&
                (event.key === 'PageUp' || event.key === 'PageDown')
            ) {
                event.preventDefault();
                switchTabRelative(event.key === 'PageDown' ? 1 : -1);
                return;
            }

            // Ctrl+C — copy selection as TSV matrix
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                if (selectedCells.size === 0 && selectedRowKeys.length === 0) return;
                event.preventDefault();

                // Rows picked through the index column live in selectedRowKeys and leave
                // selectedCells empty, so they need their own whole-row copy.
                if (selectedCells.size === 0) {
                    if (blurredColumnIndexes && blurredColumnIndexes.size > 0) {
                        toast.info(BLURRED_COPY_MESSAGE);
                        return;
                    }
                    const rowMatrix = buildRowSelectionMatrix({
                        rowKeys: selectedRowKeys,
                        displayRows,
                        rowOrder,
                        editedCells,
                        columnCount: result.columns.length,
                    });
                    if (rowMatrix.length === 0) return;
                    void setClipboardText(matrixToTsv(rowMatrix)).catch(() =>
                        toast.error('Failed to write to clipboard'),
                    );
                    return;
                }

                if (selectionTouchesBlurredColumn(selectedCells, blurredColumnIndexes)) {
                    toast.info(BLURRED_COPY_MESSAGE);
                    return;
                }

                const matrix = buildSelectionMatrix({
                    selectedCells,
                    displayRows,
                    rowOrder,
                    editedCells,
                });
                if (matrix.length === 0) return;

                void setClipboardText(matrixToTsv(matrix)).catch(() =>
                    toast.error('Failed to write to clipboard'),
                );
                return;
            }

            // Ctrl+V — paste TSV matrix
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
                if (!isEditable || selectedCells.size === 0) return;
                event.preventDefault();

                void getClipboardText()
                    .then(text => {
                        const pasteResult = applyClipboardPaste({
                            text,
                            selectedCells,
                            displayRows,
                            rowOrder,
                            editedCells,
                            draftRows,
                            deletedRows,
                            columnCount: result.columns.length,
                            mode: 'fill-selected',
                            blurredColumnIndexes,
                        });
                        if (!pasteResult) return;
                        if (pasteResult.blurredSkippedCount > 0) {
                            toast.info(blurredEditSkippedMessage(pasteResult.blurredSkippedCount));
                        }

                        setEditedCells(pasteResult.nextEdited);
                        setDraftRows(pasteResult.nextDraftRows);
                        if (pasteResult.pastedCells.size > 0)
                            setSelectedCells(pasteResult.pastedCells);
                    })
                    .catch(() => toast.error('Failed to read from clipboard'));
            }
        },
        [
            blurredColumnIndexes,
            deletedRows,
            displayRows,
            displayRowsByKey,
            draftRows,
            editedCells,
            hasPendingChanges,
            isEditable,
            isSavingDraftRows,
            onDeleteSelected,
            onRun,
            onSaveRequest,
            onSetShowRightSidebar,
            onFocusJump,
            onFocusSearch,
            onSearchNext,
            onSearchPrev,
            onUndoLastAction,
            result,
            rowOrder,
            selectedCells,
            selectedRowKeys,
            isTextEntryContext,
            setDraftRows,
            setEditedCells,
            setSelectedCells,
            toast,
            viewMode,
        ],
    );

    return { handleKeyDown };
}
