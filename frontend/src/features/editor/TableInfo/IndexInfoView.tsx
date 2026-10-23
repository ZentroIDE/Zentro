// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useMemo } from 'react';
import { Loader, RotateCcw, Save, Trash2, Hash, Plus } from 'lucide-react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { setClipboardText } from '../../../services/clipboardService';
import { useEditorStore } from '../../../stores/editorStore';
import {
    Input,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui';
import { ColumnPickerCell } from './ColumnPickerCell';
import { getErrorMessage } from '../../../lib/errors';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { WriteOperationKind } from '../../../lib/writeSafety/writeSafety';
import { type TabAction } from './types';
import {
    usePublishedTabActions,
    useSchemaObjectPanel,
    useSchemaObjectShortcuts,
} from './useSchemaObjectPanel';

// ─── Domain types ─────────────────────────────────────────────────────────────

interface IndexDef {
    Name: string;
    Table: string;
    Columns: string[];
    Unique: boolean;
}

interface IndexRowState {
    id: string;
    original: IndexDef;
    current: IndexDef;
    deleted: boolean;
    isNew?: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface IndexInfoViewProps {
    connectionID: string;
    dbName: string;
    environmentKey: string;
    schema: string;
    tableName: string;
    filterText: string;
    refreshKey: number;
    readOnlyMode?: boolean;
    isActive?: boolean;
    tableColumns?: string[];
    onActionsChange?: (actions: TabAction[]) => void;
    onDirtyCountChange?: (count: number) => void;
    uniqueOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isDirtyRow = (r: IndexRowState) =>
    !r.deleted && !r.isNew && JSON.stringify(r.original) !== JSON.stringify(r.current);

const getDirtyCount = (rows: IndexRowState[]) =>
    rows.filter(r => r.deleted || (r.isNew && r.current.Name.trim().length > 0) || isDirtyRow(r))
        .length;

const filterIndexRows = (rows: IndexRowState[], filterText: string, uniqueOnly: boolean) => {
    const base = uniqueOnly ? rows.filter(r => r.current.Unique) : rows;
    if (!filterText.trim()) return base;
    const lower = filterText.toLowerCase();
    return base.filter(
        r =>
            r.current.Name.toLowerCase().includes(lower) ||
            r.current.Columns.some(c => c.toLowerCase().includes(lower)),
    );
};

const rowFromDef = (def: IndexDef, i: number): IndexRowState => ({
    id: `idx-${i}-${def.Name}`,
    original: { ...def, Columns: [...def.Columns] },
    current: { ...def, Columns: [...def.Columns] },
    deleted: false,
});

// ─── Main component ───────────────────────────────────────────────────────────

export const IndexInfoView: React.FC<IndexInfoViewProps> = ({
    connectionID,
    dbName,
    environmentKey,
    schema,
    tableName,
    filterText,
    refreshKey,
    readOnlyMode = false,
    isActive = false,
    tableColumns = [],
    onActionsChange,
    onDirtyCountChange,
    uniqueOnly = false,
}) => {
    const addTab = useEditorStore(state => state.addTab);

    // ── Load ───────────────────────────────────────────────────────────────────

    const fetchIndexes = useCallback(async () => {
        if (!connectionID) return [] as IndexRowState[];
        const data = unwrapOrThrow(
            await getApiGateway().schema.getIndexes(connectionID, dbName, schema, tableName),
        );
        return (data || []).map((def, i) => rowFromDef(def as IndexDef, i));
        // refreshKey isn't read here — it's an extra dep so a parent-triggered
        // refresh recreates this callback (and useAsyncResource refetches).
    }, [connectionID, dbName, schema, tableName, refreshKey]);

    // Range selection follows the filtered (visible) row order.
    const getSelectableRowIds = useCallback(
        (allRows: IndexRowState[]) =>
            filterIndexRows(allRows, filterText, uniqueOnly).map(row => row.id),
        [filterText, uniqueOnly],
    );

    const {
        rows,
        setRows,
        editCell,
        setEditCell,
        selectedRows,
        clearSelection,
        handleRowMouseDown,
        handleRowMouseEnter,
        loading,
        saving,
        load: loadIndexes,
        runSaving,
        toastRef,
        hasChanges,
        toggleDeleteSelected: toggleDeleteRows,
    } = useSchemaObjectPanel<IndexRowState, 'name' | 'columns'>({
        fetchRows: fetchIndexes,
        loadErrorLabel: 'indexes',
        countDirty: getDirtyCount,
        readOnlyMode,
        onDirtyCountChange,
        getSelectableRowIds,
    });

    const handleCopyPreviewScript = useCallback(
        (script: string) => {
            void setClipboardText(script)
                .then(() => toastRef.current.success('Script copied to clipboard'))
                .catch(() => toastRef.current.error('Failed to copy script'));
        },
        [toastRef],
    );

    const handleOpenPreviewScriptInNewTab = useCallback(
        (script: string) => {
            addTab({
                name: `Apply ${schema}.${tableName} ${uniqueOnly ? 'Unique Keys' : 'Indexes'}`,
                query: script,
            });
            toastRef.current.success('Script opened in a new tab.');
        },
        [addTab, schema, tableName, toastRef, uniqueOnly],
    );

    const writeSafetyGuardOptions = useMemo(
        () => ({
            onCopyScript: handleCopyPreviewScript,
            onOpenScriptInNewTab: handleOpenPreviewScriptInNewTab,
        }),
        [handleCopyPreviewScript, handleOpenPreviewScriptInNewTab],
    );
    const { guardOperations, modals } = useWriteSafetyGuard(
        environmentKey,
        writeSafetyGuardOptions,
    );

    // ── Row mutations ─────────────────────────────────────────────────────────

    const filteredRows = useMemo(
        () => filterIndexRows(rows, filterText, uniqueOnly),
        [rows, filterText, uniqueOnly],
    );

    const updateRow = useCallback((id: string, patch: Partial<IndexDef>) => {
        setRows(prev =>
            prev.map(r => (r.id === id ? { ...r, current: { ...r.current, ...patch } } : r)),
        );
    }, []);

    const discardRow = useCallback((id: string) => {
        setRows(prev =>
            prev.map(r =>
                r.id === id
                    ? {
                          ...r,
                          current: { ...r.original, Columns: [...r.original.Columns] },
                          deleted: false,
                      }
                    : r,
            ),
        );
        setEditCell(null);
    }, []);

    const discardAll = useCallback(() => {
        setRows(prev =>
            prev
                .filter(r => !r.isNew)
                .map(r => ({
                    ...r,
                    current: { ...r.original, Columns: [...r.original.Columns] },
                    deleted: false,
                })),
        );
        clearSelection();
    }, [clearSelection, setRows]);

    const addNewRow = useCallback(() => {
        const draft: IndexDef = {
            Name: '',
            Table: tableName,
            Columns: [],
            Unique: uniqueOnly,
        };
        const newRow: IndexRowState = {
            id: `idx-new-${Date.now()}`,
            original: { ...draft },
            current: { ...draft },
            deleted: false,
            isNew: true,
        };
        setRows(prev => [...prev, newRow]);
        clearSelection();
        setEditCell({ rowId: newRow.id, field: 'name' });
    }, [clearSelection, setEditCell, setRows, tableName, uniqueOnly]);

    // ── Save all ──────────────────────────────────────────────────────────────

    const saveAll = useCallback(async () => {
        if (readOnlyMode || !connectionID) return;

        const toDelete = rows.filter(r => r.deleted && !r.isNew);
        // Skip empty drafts (name and columns both empty) — treat as abandoned
        const toCreate = rows.filter(
            r => r.isNew && !r.deleted && r.current.Name.trim().length > 0,
        );
        const toUpdate = rows.filter(r => !r.isNew && !r.deleted && isDirtyRow(r));

        if (!toDelete.length && !toCreate.length && !toUpdate.length) return;

        for (const r of [...toCreate, ...toUpdate]) {
            if (!r.current.Name.trim()) {
                toastRef.current.error('Index name is required');
                return;
            }
            if (!r.current.Columns.length) {
                toastRef.current.error(`"${r.current.Name}" needs at least one column`);
                return;
            }
        }

        const ops: WriteOperationKind[] = [
            ...toDelete.map(() => WriteOperationKind.DROP),
            ...toCreate.map(() => WriteOperationKind.CREATE),
            ...toUpdate.flatMap(() => [WriteOperationKind.DROP, WriteOperationKind.CREATE]),
        ];

        // Real DDL from the backend — never hand-written — so the script
        // shown for confirmation is exactly what will execute.
        const gateway = getApiGateway().schema;
        const scriptLines: string[] = [];
        try {
            for (const r of toDelete) {
                scriptLines.push(
                    `${unwrapOrThrow(
                        await gateway.previewDropIndexDDL(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.original.Name,
                        ),
                    )};`,
                );
            }
            for (const r of toCreate) {
                scriptLines.push(
                    `${unwrapOrThrow(
                        await gateway.previewCreateIndexDDL(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.current.Name,
                            r.current.Columns,
                            r.current.Unique,
                        ),
                    )};`,
                );
            }
            for (const r of toUpdate) {
                const dropDDL = unwrapOrThrow(
                    await gateway.previewDropIndexDDL(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        r.original.Name,
                    ),
                );
                const createDDL = unwrapOrThrow(
                    await gateway.previewCreateIndexDDL(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        r.current.Name,
                        r.current.Columns,
                        r.current.Unique,
                    ),
                );
                scriptLines.push(`${dropDDL};`, `${createDDL};`);
            }
        } catch (error: unknown) {
            toastRef.current.error(`Failed to build change preview: ${getErrorMessage(error)}`);
            return;
        }

        const guard = await guardOperations(ops, 'Apply Index Changes', scriptLines);
        if (!guard.allowed) {
            if (guard.blockedReason) toastRef.current.error(guard.blockedReason);
            return;
        }

        try {
            await runSaving(async () => {
                for (const r of toDelete) {
                    unwrapOrThrow(
                        await getApiGateway().schema.dropIndex(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.original.Name,
                        ),
                    );
                }
                for (const r of toCreate) {
                    unwrapOrThrow(
                        await getApiGateway().schema.createIndex(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.current.Name,
                            r.current.Columns,
                            r.current.Unique,
                        ),
                    );
                }
                for (const r of toUpdate) {
                    unwrapOrThrow(
                        await getApiGateway().schema.dropIndex(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.original.Name,
                        ),
                    );
                    unwrapOrThrow(
                        await getApiGateway().schema.createIndex(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            r.current.Name,
                            r.current.Columns,
                            r.current.Unique,
                        ),
                    );
                }
                toastRef.current.success('Index changes applied');
                await loadIndexes();
            });
        } catch (error: unknown) {
            toastRef.current.error(`Failed to apply changes: ${getErrorMessage(error)}`);
        }
    }, [
        connectionID,
        dbName,
        guardOperations,
        loadIndexes,
        readOnlyMode,
        rows,
        runSaving,
        schema,
        tableName,
    ]);

    const handleSaveShortcut = useCallback(() => {
        void saveAll();
    }, [saveAll]);

    useSchemaObjectShortcuts({
        isActive,
        onSave: handleSaveShortcut,
        onDeleteSelected: toggleDeleteRows,
        onDiscard: discardAll,
        hasChanges,
    });

    // ── Toolbar actions ───────────────────────────────────────────────────────

    const panelActions = useMemo<TabAction[]>(() => {
        if (readOnlyMode) return [];

        const actions: TabAction[] = [
            {
                id: 'index-new',
                icon: <Plus size={12} />,
                label: uniqueOnly ? 'Add Unique Key' : 'Add Index',
                title: uniqueOnly ? 'Add Unique Key' : 'Add Index',
                onClick: addNewRow,
                disabled: saving,
            },
        ];

        if (selectedRows.size > 0) {
            actions.push({
                id: 'index-delete',
                icon: <Trash2 size={12} />,
                label: 'Delete',
                title: 'Delete selected',
                onClick: toggleDeleteRows,
                disabled: saving,
                danger: true,
            });
        }

        if (hasChanges) {
            actions.push({
                id: 'index-discard',
                icon: <RotateCcw size={12} />,
                label: 'Discard',
                title: 'Discard all changes',
                onClick: discardAll,
                disabled: saving,
                danger: true,
            });
            actions.push({
                id: 'index-save',
                icon: <Save size={12} />,
                label: 'Save Changes',
                title: 'Save Changes',
                onClick: () => {
                    void saveAll();
                },
                disabled: saving,
                loading: saving,
            });
        }

        return actions;
    }, [
        hasChanges,
        readOnlyMode,
        saving,
        selectedRows.size,
        saveAll,
        addNewRow,
        discardAll,
        toggleDeleteRows,
    ]);

    usePublishedTabActions(panelActions, onActionsChange);

    // ── Filter ────────────────────────────────────────────────────────────────

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className='flex h-full items-center justify-center'>
                <Loader size={20} className='animate-spin text-accent' />
            </div>
        );
    }

    return (
        <div className='flex-1 flex flex-col min-h-0 bg-background'>
            {modals}

            <div className='flex-1 overflow-hidden flex flex-col'>
                <div className='flex-1 overflow-auto scrollbar-thin'>
                    <Table
                        className='result-table-tanstack border-collapse table-fixed select-none'
                        style={{ width: 'max-content', minWidth: '480px' }}
                    >
                        <TableHeader className='[&_tr]:border-b-0'>
                            <TableRow className='border-b-2 border-border hover:bg-transparent'>
                                <TableHead className='rt-th w-10  text-label text-muted-foreground'>
                                    <div className='rt-th-label justify-center'>#</div>
                                </TableHead>
                                <TableHead className='rt-th'>
                                    <div className='rt-th-label'>Name</div>
                                </TableHead>
                                <TableHead className='rt-th' style={{ width: '320px' }}>
                                    <div className='rt-th-label'>Columns</div>
                                </TableHead>
                                {!uniqueOnly && (
                                    <TableHead
                                        className='rt-th w-20 text-label text-muted-foreground'
                                        style={{ width: '80px' }}
                                    >
                                        <div className='rt-th-label justify-center'>Unique</div>
                                    </TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody className='divide-y divide-border/20 [&_tr:last-child]:border-b'>
                            {filteredRows.map((row, displayIdx) => {
                                const isDeleted = row.deleted;
                                const isNew = row.isNew;
                                const isDirty = isDirtyRow(row);
                                const isSelected = selectedRows.has(row.id);
                                const isEditingName =
                                    editCell?.rowId === row.id && editCell.field === 'name';
                                const isEditingCols =
                                    editCell?.rowId === row.id && editCell.field === 'columns';

                                const rowCls = `
                                    group relative transition-all duration-150
                                    ${displayIdx % 2 !== 0 ? 'rt-row-alt' : ''}
                                    ${isSelected ? 'rt-row-selected' : ''}
                                    ${isDeleted ? 'rt-row-deleted' : ''}
                                    ${isNew ? 'rt-row-draft' : ''}
                                `;

                                return (
                                    <TableRow
                                        key={row.id}
                                        className={`${rowCls} border-b-0 hover:bg-transparent`}
                                        onMouseDown={e => handleRowMouseDown(e, row.id)}
                                        onMouseEnter={() => handleRowMouseEnter(row.id)}
                                    >
                                        {/* # — double-click to discard row (matches columns tab) */}
                                        <TableCell className='w-10 text-center border-b border-border'>
                                            <div
                                                className='rt-cell-content rt-cell-content--compact row-num-col'
                                                onDoubleClick={() =>
                                                    (isDirty || isDeleted) &&
                                                    !isNew &&
                                                    discardRow(row.id)
                                                }
                                                title={
                                                    (isDirty || isDeleted) && !isNew
                                                        ? 'Double-click to discard changes'
                                                        : undefined
                                                }
                                            >
                                                {displayIdx + 1}
                                            </div>
                                        </TableCell>

                                        {/* Name */}
                                        <TableCell className='p-0 border-b border-border'>
                                            {isEditingName ? (
                                                <Input
                                                    autoFocus
                                                    onFocus={e => e.target.select()}
                                                    className='rt-cell-input font-mono'
                                                    value={row.current.Name}
                                                    onChange={e =>
                                                        updateRow(row.id, { Name: e.target.value })
                                                    }
                                                    onBlur={() => setEditCell(null)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter')
                                                            (e.target as HTMLInputElement).blur();
                                                        if (e.key === 'Escape') {
                                                            updateRow(row.id, {
                                                                Name: row.original.Name,
                                                            });
                                                            setEditCell(null);
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className={`rt-cell-content rt-cell-content--compact font-medium
                                                        ${isDirty && row.current.Name !== row.original.Name ? 'rt-cell-dirty' : ''}
                                                        ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                                    `}
                                                    title={row.current.Name || '(unnamed)'}
                                                    onDoubleClick={() =>
                                                        !readOnlyMode &&
                                                        !isDeleted &&
                                                        setEditCell({
                                                            rowId: row.id,
                                                            field: 'name',
                                                        })
                                                    }
                                                >
                                                    <span className='truncate'>
                                                        {row.current.Name || (
                                                            <span className='italic text-muted-foreground/50'>
                                                                untitled
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>

                                        {/* Columns */}
                                        <TableCell
                                            className='p-0 border-b border-border'
                                            style={{ width: '320px' }}
                                        >
                                            {isEditingCols ? (
                                                <div
                                                    className='px-1.5 py-0.75'
                                                    onMouseDown={e => e.stopPropagation()}
                                                >
                                                    <ColumnPickerCell
                                                        columns={tableColumns}
                                                        selected={row.current.Columns}
                                                        onChange={cols =>
                                                            updateRow(row.id, { Columns: cols })
                                                        }
                                                        onClose={() => setEditCell(null)}
                                                        autoOpen
                                                    />
                                                </div>
                                            ) : (
                                                <div
                                                    className={`rt-cell-content rt-cell-content--compact  text-label text-muted-foreground
                                                        ${isDirty && JSON.stringify(row.current.Columns) !== JSON.stringify(row.original.Columns) ? 'rt-cell-dirty' : ''}
                                                        ${!readOnlyMode && !isDeleted ? 'cursor-pointer' : ''}
                                                    `}
                                                    title={row.current.Columns.join(', ')}
                                                    onDoubleClick={() =>
                                                        !readOnlyMode &&
                                                        !isDeleted &&
                                                        setEditCell({
                                                            rowId: row.id,
                                                            field: 'columns',
                                                        })
                                                    }
                                                >
                                                    {row.current.Columns.length > 0 ? (
                                                        row.current.Columns.join(', ')
                                                    ) : (
                                                        <span className='italic text-muted-foreground/40'>
                                                            no columns
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>

                                        {/* Unique */}
                                        {!uniqueOnly && (
                                            <TableCell className='border-b border-border text-center'>
                                                <Switch
                                                    size='micro'
                                                    checked={row.current.Unique}
                                                    disabled={readOnlyMode || isDeleted || saving}
                                                    onCheckedChange={checked =>
                                                        updateRow(row.id, { Unique: checked })
                                                    }
                                                    onClick={e => e.stopPropagation()}
                                                    title={
                                                        row.current.Unique
                                                            ? 'Unique — click to remove'
                                                            : 'Click to make unique'
                                                    }
                                                />
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}

                            {rows.length === 0 && !loading && (
                                <TableRow className='hover:bg-transparent'>
                                    <TableCell
                                        colSpan={uniqueOnly ? 3 : 4}
                                        className='py-24 text-center text-muted-foreground italic bg-background/50 text-body'
                                    >
                                        {readOnlyMode
                                            ? uniqueOnly
                                                ? 'No unique keys found for this table.'
                                                : 'No indexes found for this table.'
                                            : uniqueOnly
                                              ? 'No unique keys yet. Click "Add Unique Key" to create one.'
                                              : 'No indexes yet. Click "Add Index" to create one.'}
                                    </TableCell>
                                </TableRow>
                            )}

                            {rows.length > 0 && filteredRows.length === 0 && filterText && (
                                <TableRow className='hover:bg-transparent'>
                                    <TableCell
                                        colSpan={uniqueOnly ? 3 : 4}
                                        className='py-8 text-center text-muted-foreground text-small'
                                    >
                                        {uniqueOnly
                                            ? `No unique keys match "${filterText}"`
                                            : `No indexes match "${filterText}"`}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};
