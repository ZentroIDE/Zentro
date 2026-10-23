// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { getErrorMessage } from '../../../lib/errors';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { WriteOperationKind } from '../../../lib/writeSafety/writeSafety';
import { useSchemaStore } from '../../../stores/schemaStore';
import { type TabAction } from './types';
import {
    usePublishedTabActions,
    useSchemaObjectPanel,
    useSchemaObjectShortcuts,
} from './useSchemaObjectPanel';
import { ForeignKeysTable } from './ForeignKeysTable';
import {
    FK_RULE_OPTIONS,
    type EditField,
    type FKDraft,
    type FKRowState,
    cloneFKDraft,
    isEmptyFKDraft,
    isFKDirty,
    mapFromFKInfo,
    normalizeIdent,
    toFKPayload,
    toRefCacheKey,
} from './fkUtils';

interface ForeignKeysViewProps {
    connectionID: string;
    dbName: string;
    environmentKey: string;
    schema: string;
    tableName: string;
    refreshKey: number;
    readOnlyMode?: boolean;
    isActive?: boolean;
    tableColumns?: string[];
    onActionsChange?: (actions: TabAction[]) => void;
    onDirtyCountChange?: (count: number) => void;
}

const countDirtyFKRows = (rows: FKRowState[]) =>
    rows.filter(row => row.isNew || row.deleted || isFKDirty(row)).length;

export const ForeignKeysView: React.FC<ForeignKeysViewProps> = ({
    connectionID,
    dbName,
    environmentKey,
    schema,
    tableName,
    refreshKey,
    readOnlyMode = false,
    isActive = false,
    tableColumns = [],
    onActionsChange,
    onDirtyCountChange,
}) => {
    const [refColumnCache, setRefColumnCache] = useState<Record<string, string[]>>({});
    const refColumnCacheRef = useRef<Record<string, string[]>>({});

    const treeMap = useSchemaStore(state => state.trees);
    const checkAndFetchColumns = useSchemaStore(state => state.checkAndFetchColumns);
    const { guardOperations, modals } = useWriteSafetyGuard(environmentKey);

    const schemaNodes = useMemo(() => {
        if (!connectionID || !dbName) return [];
        return treeMap[`${connectionID}:${dbName}`] ?? [];
    }, [dbName, connectionID, treeMap]);

    const loadRefColumns = useCallback(
        async (refSchema: string, refTable: string) => {
            if (!connectionID || !dbName || !refSchema || !refTable) return;
            const cacheKey = toRefCacheKey(refSchema, refTable);
            if (refColumnCacheRef.current[cacheKey]) return;

            try {
                const defs = await checkAndFetchColumns(connectionID, dbName, refSchema, refTable);
                setRefColumnCache(prev => {
                    if (prev[cacheKey]) return prev;
                    const next = { ...prev, [cacheKey]: defs.map(def => def.Name) };
                    refColumnCacheRef.current = next;
                    return next;
                });
            } catch {
                setRefColumnCache(prev => {
                    if (prev[cacheKey]) return prev;
                    const next = { ...prev, [cacheKey]: [] };
                    refColumnCacheRef.current = next;
                    return next;
                });
            }
        },
        [dbName, connectionID, checkAndFetchColumns],
    );

    const fetchForeignKeys = useCallback(async () => {
        if (!connectionID) return [] as FKRowState[];

        const response = await getApiGateway().schema.getForeignKeys(
            connectionID,
            dbName,
            schema,
            tableName,
        );
        const result = response.ok ? response.data : [];
        const fkRows = (result ?? []).map((fk, index) => {
            const current = mapFromFKInfo(fk);
            return {
                id: `fk-${index}-${current.name}`,
                original: cloneFKDraft(current),
                current,
                deleted: false,
            };
        });

        setRefColumnCache({});
        refColumnCacheRef.current = {};

        const uniqueTargets = new Set<string>();
        fkRows.forEach(row => {
            if (row.current.refSchema && row.current.refTable) {
                uniqueTargets.add(toRefCacheKey(row.current.refSchema, row.current.refTable));
            }
        });

        await Promise.all(
            [...uniqueTargets].map(async target => {
                const [refSchema, refTable] = target.split('.');
                await loadRefColumns(refSchema, refTable);
            }),
        );

        return fkRows;
        // refreshKey isn't read here — it's an extra dep so a parent-triggered
        // refresh recreates this callback (and useAsyncResource refetches).
    }, [connectionID, dbName, loadRefColumns, schema, tableName, refreshKey]);

    const {
        rows,
        setRows,
        editCell,
        setEditCell,
        selectedRows,
        hasSelection,
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
    } = useSchemaObjectPanel<FKRowState, EditField>({
        fetchRows: fetchForeignKeys,
        loadErrorLabel: 'foreign keys',
        countDirty: countDirtyFKRows,
        readOnlyMode,
        onDirtyCountChange,
    });

    const schemaOptions = useMemo(() => {
        const byNormalized = new Map<string, string>();

        schemaNodes.forEach(node => {
            const schemaName = node.Name?.trim() || '';
            if (!schemaName) return;
            byNormalized.set(normalizeIdent(schemaName), schemaName);
        });

        rows.forEach(row => {
            const schemaName = row.current.refSchema?.trim() || '';
            if (!schemaName) return;
            const key = normalizeIdent(schemaName);
            if (!byNormalized.has(key)) byNormalized.set(key, schemaName);
        });

        return [...byNormalized.values()].sort((a, b) => a.localeCompare(b));
    }, [rows, schemaNodes]);

    const tablesBySchema = useMemo(() => {
        const tableSetsBySchema = new Map<string, Set<string>>();

        const ensureTableSet = (schemaName: string) => {
            const key = normalizeIdent(schemaName);
            const existing = tableSetsBySchema.get(key);
            if (existing) return existing;

            const next = new Set<string>();
            tableSetsBySchema.set(key, next);
            return next;
        };

        schemaNodes.forEach(node => {
            const schemaName = node.Name?.trim() || '';
            if (!schemaName) return;
            const tableSet = ensureTableSet(schemaName);
            [...(node.Tables || []), ...(node.ForeignTables || [])]
                .filter(Boolean)
                .forEach(refTable => tableSet.add(refTable));
        });

        rows.forEach(row => {
            const refSchema = row.current.refSchema?.trim() || '';
            const refTable = row.current.refTable?.trim() || '';
            if (!refSchema || !refTable) return;
            ensureTableSet(refSchema).add(refTable);
        });

        const next = new Map<string, string[]>();
        tableSetsBySchema.forEach((tableSet, normalizedSchema) => {
            next.set(
                normalizedSchema,
                [...tableSet].sort((a, b) => a.localeCompare(b)),
            );
        });
        return next;
    }, [rows, schemaNodes]);
    useEffect(() => {
        rows.forEach(row => {
            if (row.deleted || !row.current.refSchema || !row.current.refTable) return;
            void loadRefColumns(row.current.refSchema, row.current.refTable);
        });
    }, [rows, loadRefColumns]);

    const updateRow = useCallback((rowId: string, patch: Partial<FKDraft>) => {
        setRows(prev =>
            prev.map(row => {
                if (row.id !== rowId) return row;
                const next: FKDraft = { ...row.current, ...patch };
                if (patch.refSchema !== undefined || patch.refTable !== undefined) {
                    next.refColumns = [];
                }
                return { ...row, current: next };
            }),
        );
    }, []);

    const discardRow = useCallback((rowId: string) => {
        setRows(prev =>
            prev.map(row =>
                row.id === rowId
                    ? { ...row, current: cloneFKDraft(row.original), deleted: false }
                    : row,
            ),
        );
        setEditCell(null);
    }, []);

    const validateDraft = useCallback(
        (draft: FKDraft): string | null => {
            if (!draft.name.trim()) return 'Foreign key name is required';
            if (draft.columns.length === 0)
                return `"${draft.name}" needs at least one source column`;
            if (!draft.refSchema.trim()) return `"${draft.name}" requires a referenced schema`;
            if (!draft.refTable.trim()) return `"${draft.name}" requires a referenced table`;
            if (draft.refColumns.length === 0)
                return `"${draft.name}" needs at least one referenced column`;
            if (draft.columns.length !== draft.refColumns.length) {
                return `"${draft.name}" source/ref column counts must match`;
            }

            const cacheKey = toRefCacheKey(draft.refSchema, draft.refTable);
            const availableColumns = refColumnCache[cacheKey];
            if (Array.isArray(availableColumns) && availableColumns.length > 0) {
                const invalidColumn = draft.refColumns.find(
                    column => !availableColumns.includes(column),
                );
                if (invalidColumn) {
                    return `"${draft.name}" referenced column "${invalidColumn}" is no longer valid`;
                }
            }

            return null;
        },
        [refColumnCache],
    );

    const discard = useCallback(() => {
        setEditCell(null);
        clearSelection();
        setRows(prev =>
            prev
                .filter(row => !row.isNew)
                .map(row => ({
                    ...row,
                    current: cloneFKDraft(row.original),
                    deleted: false,
                })),
        );
    }, [clearSelection]);

    const save = useCallback(async () => {
        if (readOnlyMode || !connectionID) return;

        const toDrop = rows.filter(row => !row.isNew && row.deleted);
        const toCreate = rows.filter(
            row => row.isNew && !row.deleted && !isEmptyFKDraft(row.current),
        );
        const toUpdate = rows.filter(row => !row.isNew && !row.deleted && isFKDirty(row));

        if (!toDrop.length && !toCreate.length && !toUpdate.length) return;

        for (const row of [...toCreate, ...toUpdate]) {
            const errorMessage = validateDraft(row.current);
            if (errorMessage) {
                toastRef.current.error(errorMessage);
                return;
            }
        }

        const operations: WriteOperationKind[] = [
            ...toDrop.map(() => WriteOperationKind.DROP),
            ...toCreate.map(() => WriteOperationKind.CREATE),
            ...toUpdate.flatMap(() => [WriteOperationKind.DROP, WriteOperationKind.CREATE]),
        ];

        const summaryLines = [
            ...toDrop.map(row => `- Drop: ${row.original.name}`),
            ...toCreate.map(
                row =>
                    `- Create: ${row.current.name} (${row.current.columns.join(', ')}) -> ${row.current.refSchema}.${row.current.refTable} (${row.current.refColumns.join(', ')})`,
            ),
            ...toUpdate.map(row => `- Update: ${row.original.name} -> ${row.current.name}`),
        ];

        const guard = await guardOperations(operations, 'Apply Foreign Key Changes', summaryLines);
        if (!guard.allowed) {
            if (guard.blockedReason) toastRef.current.error(guard.blockedReason);
            return;
        }

        try {
            await runSaving(async () => {
                for (const row of toDrop) {
                    unwrapOrThrow(
                        await getApiGateway().schema.dropForeignKey(
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
                        await getApiGateway().schema.createForeignKey(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            toFKPayload(row.current),
                        ),
                    );
                }
                for (const row of toUpdate) {
                    unwrapOrThrow(
                        await getApiGateway().schema.updateForeignKey(
                            connectionID,
                            dbName,
                            schema,
                            tableName,
                            row.original.name,
                            toFKPayload(row.current),
                        ),
                    );
                }
                toastRef.current.success('Foreign key changes applied');
                await load();
            });
        } catch (error: unknown) {
            toastRef.current.error(
                `Failed to apply foreign key changes: ${getErrorMessage(error)}`,
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

        const next: TabAction[] = [];

        if (!saving) {
            next.push({
                id: 'fk-add',
                icon: <Plus size={12} />,
                label: 'Add FK',
                title: 'Add Foreign Key',
                onClick: () => {
                    const draft: FKDraft = {
                        name: '',
                        columns: [],
                        refSchema: schema,
                        refTable: '',
                        refColumns: [],
                        onDelete: FK_RULE_OPTIONS[0],
                        onUpdate: FK_RULE_OPTIONS[0],
                    };
                    const row: FKRowState = {
                        id: `fk-new-${Date.now()}`,
                        original: cloneFKDraft(draft),
                        current: draft,
                        deleted: false,
                        isNew: true,
                    };

                    setRows(prev => [...prev, row]);
                    clearSelection();
                    setEditCell({ rowId: row.id, field: 'name' });
                },
            });
        }

        if (hasSelection) {
            next.push({
                id: 'fk-delete-selected',
                icon: <Trash2 size={12} />,
                label: 'Delete',
                title: 'Delete selected',
                onClick: toggleDeleteSelected,
                disabled: saving,
                danger: true,
            });
        }

        if (hasChanges) {
            next.push({
                id: 'fk-discard',
                icon: <RotateCcw size={12} />,
                label: 'Discard',
                title: 'Discard pending changes',
                onClick: discard,
                disabled: saving,
                danger: true,
            });
            next.push({
                id: 'fk-save',
                icon: <Save size={12} />,
                label: 'Save',
                title: 'Save Foreign Key Changes',
                onClick: () => {
                    void save();
                },
                disabled: saving,
                loading: saving,
            });
        }

        return next;
    }, [
        clearSelection,
        discard,
        hasChanges,
        hasSelection,
        readOnlyMode,
        save,
        saving,
        schema,
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
    });

    if (loading) {
        return <div className='px-3 py-4 text-label text-muted-foreground'>Loading...</div>;
    }

    return (
        <div className='flex-1 flex flex-col min-h-0 bg-background'>
            {modals}

            <div className='flex-1 overflow-hidden flex flex-col'>
                <ForeignKeysTable
                    rows={rows}
                    editCell={editCell}
                    setEditCell={setEditCell}
                    selectedRows={selectedRows}
                    handleRowMouseDown={handleRowMouseDown}
                    handleRowMouseEnter={handleRowMouseEnter}
                    updateRow={updateRow}
                    discardRow={discardRow}
                    loadRefColumns={loadRefColumns}
                    tablesBySchema={tablesBySchema}
                    refColumnCache={refColumnCache}
                    schemaOptions={schemaOptions}
                    tableColumns={tableColumns}
                    readOnlyMode={readOnlyMode}
                    saving={saving}
                />
            </div>
        </div>
    );
};
