// SPDX-License-Identifier: GPL-3.0-only

import { getDriverCapabilities } from '../../../lib/driverCapabilities';
import { useCallback, useEffect, useState } from 'react';
import { models } from '../../../../wailsjs/go/models';
import { RowState, TableInfoTab } from './types';
import { withEditableColumnType } from './editableColumnType';

interface UseTableColumnEditorProps {
    viewMode: boolean;
    activeTab: TableInfoTab;
    driver?: string;
}

export function useTableColumnEditor({ viewMode, activeTab, driver }: UseTableColumnEditorProps) {
    const [rows, setRows] = useState<RowState[]>([]);
    const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
    const [editCell, setEditCell] = useState<{
        rowIdx: number;
        field: 'Name' | 'DefaultValue';
    } | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleRowMouseDown = useCallback(
        (e: React.MouseEvent, idx: number) => {
            if (e.button !== 0) return;
            setIsDragging(true);
            setDragStartIdx(idx);
            if (e.ctrlKey || e.metaKey) {
                setSelectedRows(prev => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                });
            } else if (e.shiftKey && selectedRows.size > 0) {
                const arr = Array.from(selectedRows);
                const start = Math.min(...arr);
                const min = Math.min(start, idx);
                const max = Math.max(start, idx);
                const next = new Set<number>();
                for (let i = min; i <= max; i++) next.add(i);
                setSelectedRows(next);
            } else {
                setSelectedRows(new Set([idx]));
            }
        },
        [selectedRows],
    );

    const handleRowMouseEnter = useCallback(
        (idx: number) => {
            if (!isDragging || dragStartIdx === null) return;
            const min = Math.min(dragStartIdx, idx);
            const max = Math.max(dragStartIdx, idx);
            const next = new Set<number>();
            for (let i = min; i <= max; i++) next.add(i);
            setSelectedRows(next);
        },
        [isDragging, dragStartIdx],
    );

    useEffect(() => {
        const h = () => {
            setIsDragging(false);
            setDragStartIdx(null);
        };
        window.addEventListener('mouseup', h);
        return () => window.removeEventListener('mouseup', h);
    }, []);

    const toggleDeleteRows = useCallback(() => {
        if (viewMode || !selectedRows.size) return;
        setRows(
            prev =>
                prev
                    .map((r, i) => {
                        if (selectedRows.has(i)) {
                            if (r.isNew) return null;
                            return { ...r, deleted: !r.deleted };
                        }
                        return r;
                    })
                    .filter(Boolean) as RowState[],
        );
        setSelectedRows(new Set());
    }, [selectedRows, viewMode]);

    useEffect(() => {
        if (activeTab !== 'columns') return;
        const h = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
                return;
            if (e.key === 'Delete' || (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)))
                toggleDeleteRows();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [activeTab, toggleDeleteRows]);

    const updateRow = useCallback(
        (idx: number, patch: Partial<models.ColumnDef>) => {
            if (viewMode) return;
            setRows(prev =>
                prev.map((r, i) => {
                    if (i !== idx) return r;
                    const nextCurrent = { ...r.current, ...patch };
                    return {
                        ...r,
                        current:
                            typeof patch.DataType === 'string'
                                ? withEditableColumnType(nextCurrent, patch.DataType)
                                : nextCurrent,
                    };
                }),
            );
        },
        [viewMode],
    );

    const discardRow = useCallback((idx: number) => {
        setRows(prev =>
            prev.map((r, i) =>
                i === idx ? { ...r, current: { ...r.original }, deleted: false } : r,
            ),
        );
        setRowErrors(e => {
            const ne = { ...e };
            delete ne[idx];
            return ne;
        });
    }, []);

    const discardAll = useCallback(() => {
        setRows(prev =>
            prev
                .filter(r => !r.isNew)
                .map(r => ({ ...r, current: { ...r.original }, deleted: false })),
        );
        setRowErrors({});
        setSelectedRows(new Set());
    }, []);

    const addColumn = useCallback(() => {
        if (viewMode) return;
        setRows(prev => {
            const newCol: models.ColumnDef = {
                Name: `new_column_${prev.length + 1}`,
                DataType: getDriverCapabilities(driver).defaultTextColumnType,
                FullDataType: getDriverCapabilities(driver).defaultTextColumnType,
                DefaultValue: '',
                IsNullable: true,
                IsPrimaryKey: false,
            };
            return [
                ...prev,
                {
                    id: `new-${Date.now()}`,
                    original: { ...newCol },
                    current: { ...newCol },
                    deleted: false,
                    isNew: true,
                },
            ];
        });
    }, [driver, viewMode]);

    return {
        rows,
        setRows,
        rowErrors,
        setRowErrors,
        editCell,
        setEditCell,
        selectedRows,
        setSelectedRows,
        dragStartIdx,
        isDragging,
        handleRowMouseDown,
        handleRowMouseEnter,
        toggleDeleteRows,
        updateRow,
        discardRow,
        discardAll,
        addColumn,
    };
}
