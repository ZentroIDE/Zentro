// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useMemo } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { setClipboardText } from '../../../services/clipboardService';
import { useEditorStore } from '../../../stores/editorStore';
import {
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui';
import { getErrorMessage } from '../../../lib/errors';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { WriteOperationKind } from '../../../lib/writeSafety/writeSafety';
import { type TabAction } from './types';
import {
    usePublishedTabActions,
    useSchemaObjectPanel,
    useSchemaObjectShortcuts,
} from './useSchemaObjectPanel';

interface CheckDraft {
    name: string;
    expression: string;
}

interface CheckRowState {
    id: string;
    original: CheckDraft;
    current: CheckDraft;
    deleted: boolean;
    isNew?: boolean;
}

type EditField = 'name' | 'expression';

interface CheckConstraintsViewProps {
    connectionID: string;
    dbName: string;
    environmentKey: string;
    schema: string;
    tableName: string;
    refreshKey: number;
    readOnlyMode?: boolean;
    isActive?: boolean;
    onActionsChange?: (actions: TabAction[]) => void;
    onDirtyCountChange?: (count: number) => void;
}

const cloneDraft = (draft: CheckDraft): CheckDraft => ({
    name: draft.name,
    expression: draft.expression,
});

const isDirty = (row: CheckRowState) =>
    JSON.stringify(row.original) !== JSON.stringify(row.current);

const isEmptyDraft = (draft: CheckDraft) => !draft.name.trim() && !draft.expression.trim();

const countDirtyCheckRows = (rows: CheckRowState[]) =>
    rows.filter(row => row.isNew || row.deleted || isDirty(row)).length;

export const CheckConstraintsView: React.FC<CheckConstraintsViewProps> = ({
    connectionID,
    dbName,
    environmentKey,
    schema,
    tableName,
    refreshKey,
    readOnlyMode = false,
    isActive = false,
    onActionsChange,
    onDirtyCountChange,
}) => {
    const addTab = useEditorStore(state => state.addTab);

    const fetchCheckConstraints = useCallback(async () => {
        if (!connectionID) return [] as CheckRowState[];
        const response = await getApiGateway().schema.getCheckConstraints(
            connectionID,
            dbName,
            schema,
            tableName,
        );
        const result = response.ok ? response.data : [];
        return (result ?? []).map((check, index) => {
            const draft: CheckDraft = {
                name: check.Name || '',
                expression: check.Expression || '',
            };
            return {
                id: `chk-${index}-${draft.name}`,
                original: cloneDraft(draft),
                current: cloneDraft(draft),
                deleted: false,
            };
        });
        // refreshKey isn't read here — it's an extra dep so a parent-triggered
        // refresh recreates this callback (and useAsyncResource refetches).
    }, [connectionID, dbName, schema, tableName, refreshKey]);

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
        load,
        runSaving,
        toastRef,
        hasChanges,
        toggleDeleteSelected,
    } = useSchemaObjectPanel<CheckRowState, EditField>({
        fetchRows: fetchCheckConstraints,
        loadErrorLabel: 'check constraints',
        countDirty: countDirtyCheckRows,
        readOnlyMode,
        onDirtyCountChange,
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
                name: `Apply ${schema}.${tableName} Check Constraints`,
                query: script,
            });
            toastRef.current.success('Script opened in a new tab.');
        },
        [addTab, schema, tableName, toastRef],
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

    const updateRow = useCallback((rowId: string, patch: Partial<CheckDraft>) => {
        setRows(prev =>
            prev.map(row =>
                row.id === rowId ? { ...row, current: { ...row.current, ...patch } } : row,
            ),
        );
    }, []);

    const discardRow = useCallback((rowId: string) => {
        setRows(
            prev =>
                prev
                    .map(row => {
                        if (row.id !== rowId) return row;
                        if (row.isNew) return null;
                        return {
                            ...row,
                            current: cloneDraft(row.original),
                            deleted: false,
                        };
                    })
                    .filter(Boolean) as CheckRowState[],
        );
        setEditCell(null);
    }, []);

    const discard = useCallback(() => {
        setRows(prev =>
            prev
                .filter(row => !row.isNew)
                .map(row => ({
                    ...row,
                    current: cloneDraft(row.original),
                    deleted: false,
                })),
        );
        clearSelection();
    }, [clearSelection, setRows]);

    const validateDraft = useCallback((draft: CheckDraft): string | null => {
        if (!draft.name.trim()) return 'Check constraint name is required';
        if (!draft.expression.trim()) return `"${draft.name}" needs an expression`;
        return null;
    }, []);

    const save = useCallback(async () => {
        if (readOnlyMode || !connectionID) return;

        const toDrop = rows.filter(row => !row.isNew && row.deleted);
        const toCreate = rows.filter(
            row => row.isNew && !row.deleted && !isEmptyDraft(row.current),
        );
        const toUpdate = rows.filter(row => !row.isNew && !row.deleted && isDirty(row));

        if (!toDrop.length && !toCreate.length && !toUpdate.length) return;

        for (const row of [...toCreate, ...toUpdate]) {
            const err = validateDraft(row.current);
            if (err) {
                toastRef.current.error(err);
                return;
            }
        }

        const ops: WriteOperationKind[] = [
            ...toDrop.map(() => WriteOperationKind.DROP),
            ...toCreate.map(() => WriteOperationKind.CREATE),
            ...toUpdate.flatMap(() => [WriteOperationKind.DROP, WriteOperationKind.CREATE]),
        ];

        // Real DDL from the backend — never hand-written — so the script
        // shown for confirmation is exactly what will execute.
        const gateway = getApiGateway().schema;
        const scriptLines: string[] = [];
        try {
            for (const row of toDrop) {
                scriptLines.push(
                    `${unwrapOrThrow(
                        await gateway.previewDropCheckConstraintDDL(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.original.name,
                        ),
                    )};`,
                );
            }
            for (const row of toCreate) {
                scriptLines.push(
                    `${unwrapOrThrow(
                        await gateway.previewAddCheckConstraintDDL(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.current.name,
                            row.current.expression,
                        ),
                    )};`,
                );
            }
            for (const row of toUpdate) {
                const dropDDL = unwrapOrThrow(
                    await gateway.previewDropCheckConstraintDDL(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        row.original.name,
                    ),
                );
                const createDDL = unwrapOrThrow(
                    await gateway.previewAddCheckConstraintDDL(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        row.current.name,
                        row.current.expression,
                    ),
                );
                scriptLines.push(`${dropDDL};`, `${createDDL};`);
            }
        } catch (error: unknown) {
            toastRef.current.error(`Failed to build change preview: ${getErrorMessage(error)}`);
            return;
        }

        const guard = await guardOperations(ops, 'Apply Check Constraint Changes', scriptLines);
        if (!guard.allowed) {
            if (guard.blockedReason) toastRef.current.error(guard.blockedReason);
            return;
        }

        try {
            await runSaving(async () => {
                for (const row of toDrop) {
                    unwrapOrThrow(
                        await getApiGateway().schema.dropCheckConstraint(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.original.name,
                        ),
                    );
                }
                for (const row of toCreate) {
                    unwrapOrThrow(
                        await getApiGateway().schema.createCheckConstraint(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.current.name,
                            row.current.expression,
                        ),
                    );
                }
                for (const row of toUpdate) {
                    unwrapOrThrow(
                        await getApiGateway().schema.dropCheckConstraint(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.original.name,
                        ),
                    );
                    unwrapOrThrow(
                        await getApiGateway().schema.createCheckConstraint(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.current.name,
                            row.current.expression,
                        ),
                    );
                }
                toastRef.current.success('Check constraint changes applied');
                await load();
            });
        } catch (error: unknown) {
            toastRef.current.error(
                `Failed to apply check constraint changes: ${getErrorMessage(error)}`,
            );
        }
    }, [
        connectionID,
        dbName,
        guardOperations,
        load,
        readOnlyMode,
        rows,
        runSaving,
        schema,
        tableName,
        validateDraft,
    ]);

    const actions = useMemo<TabAction[]>(() => {
        if (readOnlyMode) return [];
        const result: TabAction[] = [];

        if (!saving) {
            result.push({
                id: 'chk-add',
                icon: <Plus size={12} />,
                label: 'Add Check',
                title: 'Add check constraint',
                onClick: () => {
                    const draft: CheckDraft = { name: '', expression: '' };
                    const row: CheckRowState = {
                        id: `chk-new-${Date.now()}`,
                        original: cloneDraft(draft),
                        current: cloneDraft(draft),
                        deleted: false,
                        isNew: true,
                    };
                    setRows(prev => [...prev, row]);
                    clearSelection();
                    setEditCell({ rowId: row.id, field: 'name' });
                },
            });
        }

        if (selectedRows.size > 0) {
            result.push({
                id: 'chk-delete-selected',
                icon: <Trash2 size={12} />,
                label: 'Delete',
                title: 'Delete selected',
                onClick: toggleDeleteSelected,
                disabled: saving,
                danger: true,
            });
        }

        if (hasChanges) {
            result.push({
                id: 'chk-discard',
                icon: <RotateCcw size={12} />,
                label: 'Discard',
                title: 'Discard pending changes',
                onClick: discard,
                disabled: saving,
                danger: true,
            });
            result.push({
                id: 'chk-save',
                icon: <Save size={12} />,
                label: 'Save',
                title: 'Save check constraint changes',
                onClick: () => {
                    void save();
                },
                disabled: saving,
                loading: saving,
            });
        }

        return result;
    }, [
        clearSelection,
        discard,
        hasChanges,
        readOnlyMode,
        save,
        saving,
        selectedRows.size,
        setEditCell,
        setRows,
        toggleDeleteSelected,
    ]);

    usePublishedTabActions(actions, onActionsChange);

    const handleSaveShortcut = useCallback(() => {
        void save();
    }, [save]);
    useSchemaObjectShortcuts({
        isActive,
        onSave: handleSaveShortcut,
        onDeleteSelected: toggleDeleteSelected,
        onEscape: clearSelection,
        onDiscard: discard,
        hasChanges,
    });

    if (loading) {
        return <div className='px-3 py-4 text-label text-muted-foreground'>Loading...</div>;
    }

    return (
        <div className='flex-1 flex flex-col min-h-0 bg-background'>
            {modals}

            <div className='flex-1 overflow-hidden flex flex-col'>
                <div className='flex-1 overflow-auto scrollbar-thin'>
                    <Table
                        className='result-table-tanstack border-collapse table-fixed select-none'
                        style={{ width: 'max-content', minWidth: '640px' }}
                    >
                        <TableHeader className='[&_tr]:border-b-0'>
                            <TableRow className='border-b-2 border-border hover:bg-transparent'>
                                <TableHead className='rt-th w-10  text-label text-muted-foreground'>
                                    <div className='rt-th-label justify-center'>#</div>
                                </TableHead>
                                <TableHead className='rt-th' style={{ width: '200px' }}>
                                    <div className='rt-th-label'>Name</div>
                                </TableHead>
                                <TableHead className='rt-th' style={{ width: '430px' }}>
                                    <div className='rt-th-label'>Expression</div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className='divide-y divide-border/20 [&_tr:last-child]:border-b'>
                            {rows.map((row, displayIdx) => {
                                const rowIsDirty = isDirty(row);
                                const rowIsDeleted = row.deleted;
                                const rowIsNew = row.isNew;
                                const isSelected = selectedRows.has(row.id);

                                const isEditingName =
                                    editCell?.rowId === row.id && editCell.field === 'name';
                                const isEditingExpression =
                                    editCell?.rowId === row.id && editCell.field === 'expression';

                                const rowClassName = `
                                    group relative transition-all duration-150
                                    ${displayIdx % 2 !== 0 ? 'rt-row-alt' : ''}
                                    ${isSelected ? 'rt-row-selected' : ''}
                                    ${rowIsDeleted ? 'rt-row-deleted' : ''}
                                    ${rowIsNew ? 'rt-row-draft' : ''}
                                `;

                                return (
                                    <TableRow
                                        key={row.id}
                                        className={`${rowClassName} border-b-0 hover:bg-transparent`}
                                        onMouseDown={event => handleRowMouseDown(event, row.id)}
                                        onMouseEnter={() => handleRowMouseEnter(row.id)}
                                    >
                                        <TableCell className='w-10 text-center border-b border-border'>
                                            <div
                                                className='rt-cell-content rt-cell-content--compact row-num-col'
                                                onDoubleClick={() =>
                                                    (rowIsDirty || rowIsDeleted) &&
                                                    !rowIsNew &&
                                                    discardRow(row.id)
                                                }
                                                title={
                                                    (rowIsDirty || rowIsDeleted) && !rowIsNew
                                                        ? 'Double-click to discard changes'
                                                        : undefined
                                                }
                                            >
                                                {displayIdx + 1}
                                            </div>
                                        </TableCell>

                                        <TableCell
                                            className='p-0 border-b border-border'
                                            style={{ width: '200px' }}
                                        >
                                            {isEditingName ? (
                                                <Input
                                                    autoFocus
                                                    onFocus={event => event.target.select()}
                                                    placeholder='check_constraint_name'
                                                    className='rt-cell-input font-mono'
                                                    value={row.current.name}
                                                    onChange={event =>
                                                        updateRow(row.id, {
                                                            name: event.target.value,
                                                        })
                                                    }
                                                    onBlur={() => setEditCell(null)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter')
                                                            (
                                                                event.target as HTMLInputElement
                                                            ).blur();
                                                        if (event.key === 'Escape') {
                                                            updateRow(row.id, {
                                                                name: row.original.name,
                                                            });
                                                            setEditCell(null);
                                                        }
                                                    }}
                                                    disabled={saving || rowIsDeleted}
                                                />
                                            ) : (
                                                <div
                                                    className={`rt-cell-content rt-cell-content--compact
                                                        ${row.current.name !== row.original.name ? 'rt-cell-dirty' : ''}
                                                        ${!readOnlyMode && !rowIsDeleted ? 'cursor-pointer' : ''}
                                                    `}
                                                    title={row.current.name || '(unnamed)'}
                                                    onDoubleClick={() =>
                                                        !readOnlyMode &&
                                                        !rowIsDeleted &&
                                                        setEditCell({
                                                            rowId: row.id,
                                                            field: 'name',
                                                        })
                                                    }
                                                >
                                                    <span className='truncate  text-label'>
                                                        {row.current.name || (
                                                            <span className='italic text-muted-foreground/50'>
                                                                untitled
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>

                                        <TableCell
                                            className='p-0 border-b border-border'
                                            style={{ width: '430px' }}
                                        >
                                            {isEditingExpression ? (
                                                <Input
                                                    autoFocus
                                                    onFocus={event => event.target.select()}
                                                    placeholder='CHECK (amount > 0)'
                                                    className='rt-cell-input font-mono'
                                                    value={row.current.expression}
                                                    onChange={event =>
                                                        updateRow(row.id, {
                                                            expression: event.target.value,
                                                        })
                                                    }
                                                    onBlur={() => setEditCell(null)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter')
                                                            (
                                                                event.target as HTMLInputElement
                                                            ).blur();
                                                        if (event.key === 'Escape') {
                                                            updateRow(row.id, {
                                                                expression: row.original.expression,
                                                            });
                                                            setEditCell(null);
                                                        }
                                                    }}
                                                    disabled={saving || rowIsDeleted}
                                                />
                                            ) : (
                                                <div
                                                    className={`rt-cell-content rt-cell-content--compact  text-label text-muted-foreground
                                                        ${row.current.expression !== row.original.expression ? 'rt-cell-dirty' : ''}
                                                        ${!readOnlyMode && !rowIsDeleted ? 'cursor-pointer' : ''}
                                                    `}
                                                    title={row.current.expression}
                                                    onDoubleClick={() =>
                                                        !readOnlyMode &&
                                                        !rowIsDeleted &&
                                                        setEditCell({
                                                            rowId: row.id,
                                                            field: 'expression',
                                                        })
                                                    }
                                                >
                                                    {row.current.expression || (
                                                        <span className='italic text-muted-foreground/40'>
                                                            enter check expression
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {rows.length === 0 && !loading && (
                                <TableRow className='hover:bg-transparent'>
                                    <TableCell
                                        colSpan={3}
                                        className='py-24 text-center text-muted-foreground italic bg-background/50 text-body'
                                    >
                                        {readOnlyMode
                                            ? 'No check constraints defined for this table.'
                                            : 'No check constraints yet. Click "Add Check" to create one.'}
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
