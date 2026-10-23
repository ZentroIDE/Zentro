// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseRowSelectionOptions {
    rowIds: string[];
    onClearEdit?: () => void;
}

interface RowMouseEventLike {
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}

export const useRowSelection = ({ rowIds, onClearEdit }: UseRowSelectionOptions) => {
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [dragStartRowId, setDragStartRowId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const clearSelection = useCallback(() => {
        setSelectedRows(new Set());
        setDragStartRowId(null);
        setIsDragging(false);
        onClearEdit?.();
    }, [onClearEdit]);

    const hasSelection = selectedRows.size > 0;

    const selectRange = useCallback(
        (startId: string, endId: string) => {
            const startIdx = rowIds.indexOf(startId);
            const endIdx = rowIds.indexOf(endId);
            if (startIdx === -1 || endIdx === -1) return;

            const next = new Set<string>();
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            for (let i = min; i <= max; i += 1) next.add(rowIds[i]);
            setSelectedRows(next);
        },
        [rowIds],
    );

    const handleRowMouseDown = useCallback(
        (event: RowMouseEventLike, rowId: string) => {
            if (event.button !== 0) return;

            setIsDragging(true);
            setDragStartRowId(rowId);

            if (event.ctrlKey || event.metaKey) {
                setSelectedRows(prev => {
                    const next = new Set(prev);
                    if (next.has(rowId)) next.delete(rowId);
                    else next.add(rowId);
                    return next;
                });
                return;
            }

            if (event.shiftKey && selectedRows.size > 0) {
                const anchorId =
                    dragStartRowId && rowIds.includes(dragStartRowId)
                        ? dragStartRowId
                        : Array.from(selectedRows)[0];
                if (anchorId) selectRange(anchorId, rowId);
                return;
            }

            setSelectedRows(new Set([rowId]));
        },
        [dragStartRowId, rowIds, selectRange, selectedRows],
    );

    const handleRowMouseEnter = useCallback(
        (rowId: string) => {
            if (!isDragging || dragStartRowId === null) return;
            selectRange(dragStartRowId, rowId);
        },
        [dragStartRowId, isDragging, selectRange],
    );

    const clearAfterMutation = useCallback(() => {
        setSelectedRows(new Set());
        setDragStartRowId(null);
        setIsDragging(false);
        onClearEdit?.();
    }, [onClearEdit]);

    useEffect(() => {
        const stopDragging = () => {
            setIsDragging(false);
            setDragStartRowId(null);
        };
        window.addEventListener('mouseup', stopDragging);
        return () => window.removeEventListener('mouseup', stopDragging);
    }, []);

    useEffect(() => {
        setSelectedRows(prev => {
            const next = new Set([...prev].filter(rowId => rowIds.includes(rowId)));
            return next.size === prev.size ? prev : next;
        });
    }, [rowIds]);

    return useMemo(
        () => ({
            selectedRows,
            hasSelection,
            setSelectedRows,
            clearSelection,
            clearAfterMutation,
            handleRowMouseDown,
            handleRowMouseEnter,
        }),
        [
            clearAfterMutation,
            clearSelection,
            handleRowMouseDown,
            handleRowMouseEnter,
            hasSelection,
            selectedRows,
        ],
    );
};
