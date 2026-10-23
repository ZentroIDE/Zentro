// SPDX-License-Identifier: GPL-3.0-only

import { getDriverCapabilities } from '../../../lib/driverCapabilities';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { setClipboardText } from '../../../services/clipboardService';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { useConfirmAction } from '../../../hooks/useConfirmAction';
import { useEditorStore } from '../../../stores/editorStore';
import { useToast } from '../../../components/layout/Toast';
import { Button, ConfirmDialog, Input } from '../../../components/ui';
import { getErrorMessage } from '../../../lib/errors';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { WriteOperationKind } from '../../../lib/writeSafety/writeSafety';
import { ColumnPickerCell } from './ColumnPickerCell';
import { type TabAction } from './types';

// --- Types --------------------------------------------------------------------

interface PKState {
    name: string;
    columns: string[];
}

// --- Props --------------------------------------------------------------------

interface PrimaryKeyViewProps {
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
    driver?: string;
}

// --- Component ----------------------------------------------------------------

export const PrimaryKeyView: React.FC<PrimaryKeyViewProps> = ({
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
    driver,
}) => {
    const supportsAlterPk = getDriverCapabilities(driver).supportsAlterPrimaryKey;

    const [pkDraft, setPkDraft] = useState<PKState | null>(null);
    const [editingCols, setEditingCols] = useState(false);

    const addTab = useEditorStore(state => state.addTab);
    const { toast } = useToast();
    const toastRef = useRef(toast);

    const handleCopyPreviewScript = useCallback((script: string) => {
        void setClipboardText(script)
            .then(() => toastRef.current.success('Script copied to clipboard'))
            .catch(() => toastRef.current.error('Failed to copy script'));
    }, []);

    const handleOpenPreviewScriptInNewTab = useCallback(
        (script: string) => {
            addTab({
                name: `Apply ${schema}.${tableName} Primary Key`,
                query: script,
            });
            toastRef.current.success('Script opened in a new tab.');
        },
        [addTab, schema, tableName],
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
    const dropConfirm = useConfirmAction<string>();
    const onActionsChangeRef = useRef<PrimaryKeyViewProps['onActionsChange']>(onActionsChange);
    const onDirtyCountChangeRef =
        useRef<PrimaryKeyViewProps['onDirtyCountChange']>(onDirtyCountChange);

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    useEffect(() => {
        onActionsChangeRef.current = onActionsChange;
    }, [onActionsChange]);

    useEffect(() => {
        onDirtyCountChangeRef.current = onDirtyCountChange;
    }, [onDirtyCountChange]);

    // -- Load ------------------------------------------------------------------

    const fetchPk = useCallback(async () => {
        if (!connectionID || !supportsAlterPk) return null;
        const response = await getApiGateway().schema.getPrimaryKey(
            connectionID,
            dbName,
            schema,
            tableName,
        );
        const result = response.ok ? response.data : null;
        return result ? { name: result.Name, columns: result.Columns ?? [] } : null;
        // refreshKey isn't read here — it's an extra dep so a parent-triggered
        // refresh recreates this callback (and useAsyncResource refetches).
    }, [connectionID, dbName, schema, supportsAlterPk, tableName, refreshKey]);

    const {
        data: pk,
        loading,
        saving,
        error: loadError,
        refresh: load,
        runSaving,
    } = useAsyncResource<PKState | null>(fetchPk);

    useEffect(() => {
        if (loadError) {
            toastRef.current.error(`Failed to load primary key: ${getErrorMessage(loadError)}`);
        }
    }, [loadError]);

    // A completed load (success or content-identical) always resets any
    // pending draft, matching the pre-refactor load()'s own reset.
    useEffect(() => {
        setPkDraft(null);
        setEditingCols(false);
    }, [pk]);

    // -- Dirty -----------------------------------------------------------------

    const dirtyCount = pkDraft ? 1 : 0;
    useEffect(() => {
        onDirtyCountChangeRef.current?.(dirtyCount);
    }, [dirtyCount]);

    // -- Discard ---------------------------------------------------------------

    const discard = useCallback(() => {
        setPkDraft(null);
        setEditingCols(false);
    }, []);

    // -- Save ------------------------------------------------------------------

    const save = useCallback(async () => {
        if (readOnlyMode || !connectionID || !pkDraft) return;
        if (!pkDraft.name.trim()) {
            toastRef.current.error('Primary key name is required');
            return;
        }
        if (!pkDraft.columns.length) {
            toastRef.current.error('Primary key needs at least one column');
            return;
        }

        // Real DDL from the backend — never hand-written — so the script
        // shown for confirmation is exactly what will execute.
        let scriptLines: string[];
        try {
            const ddl = unwrapOrThrow(
                await getApiGateway().schema.previewAddPrimaryKeyDDL(
                    connectionID,
                    dbName,
                    schema,
                    tableName,
                    pkDraft.name,
                    pkDraft.columns,
                ),
            );
            scriptLines = [`${ddl};`];
        } catch (error: unknown) {
            toastRef.current.error(`Failed to build change preview: ${getErrorMessage(error)}`);
            return;
        }

        const guard = await guardOperations(
            [WriteOperationKind.CREATE],
            'Apply Primary Key',
            scriptLines,
        );
        if (!guard.allowed) {
            if (guard.blockedReason) toastRef.current.error(guard.blockedReason);
            return;
        }

        try {
            await runSaving(async () => {
                unwrapOrThrow(
                    await getApiGateway().schema.addPrimaryKey(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        pkDraft.name,
                        pkDraft.columns,
                    ),
                );
                toastRef.current.success('Primary key applied');
                await load();
            });
        } catch (error: unknown) {
            toastRef.current.error(`Failed to apply primary key: ${getErrorMessage(error)}`);
        }
    }, [
        connectionID,
        dbName,
        guardOperations,
        load,
        pkDraft,
        readOnlyMode,
        runSaving,
        schema,
        tableName,
    ]);

    // -- Drop ------------------------------------------------------------------

    const handleDropConfirm = useCallback(
        async (name: string) => {
            if (!connectionID) return;

            // Real DDL from the backend — never hand-written — so the
            // script shown for confirmation is exactly what will execute.
            let scriptLines: string[];
            try {
                const ddl = unwrapOrThrow(
                    await getApiGateway().schema.previewDropPrimaryKeyDDL(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        name,
                    ),
                );
                scriptLines = [`${ddl};`];
            } catch (error: unknown) {
                toastRef.current.error(`Failed to build change preview: ${getErrorMessage(error)}`);
                return;
            }

            const guard = await guardOperations(
                [WriteOperationKind.DROP],
                'Drop Primary Key',
                scriptLines,
            );
            if (!guard.allowed) {
                if (guard.blockedReason) toastRef.current.error(guard.blockedReason);
                return;
            }
            try {
                unwrapOrThrow(
                    await getApiGateway().schema.dropPrimaryKey(
                        connectionID,
                        dbName,
                        schema,
                        tableName,
                        name,
                    ),
                );
                toastRef.current.success(`Primary key "${name}" dropped`);
                await load();
            } catch (error: unknown) {
                toastRef.current.error(`Failed to drop primary key: ${getErrorMessage(error)}`);
            }
        },
        [connectionID, dbName, guardOperations, load, schema, tableName],
    );

    // -- Actions ---------------------------------------------------------------

    const hasChanges = dirtyCount > 0;

    const actions = useMemo<TabAction[]>(() => {
        if (readOnlyMode || !supportsAlterPk) return [];
        const result: TabAction[] = [];
        if (!pk && !pkDraft && !saving) {
            result.push({
                id: 'pk-add',
                label: 'Add PK',
                title: 'Add Primary Key',
                icon: null,
                onClick: () => setPkDraft({ name: '', columns: [] }),
            });
        }
        if (hasChanges) {
            result.push({
                id: 'pk-discard',
                icon: <RotateCcw size={12} />,
                label: 'Discard',
                title: 'Discard pending changes',
                onClick: discard,
                disabled: saving,
                danger: true,
            });
            result.push({
                id: 'pk-save',
                icon: <Save size={12} />,
                label: 'Save',
                title: 'Save Primary Key',
                onClick: () => {
                    void save();
                },
                disabled: saving,
                loading: saving,
            });
        }
        return result;
    }, [readOnlyMode, supportsAlterPk, pk, pkDraft, saving, hasChanges, discard, save]);

    useEffect(() => {
        onActionsChangeRef.current?.(actions);
    }, [actions]);

    // -- Keyboard --------------------------------------------------------------

    useEffect(() => {
        if (!isActive) return;
        const h = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
                return;
            if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void save();
                return;
            }
            // The draft form is the "cell" here — Escape discards it in one
            // press, same as Escape while editing a cell elsewhere in Keys.
            if (e.key === 'Escape' && pkDraft) {
                discard();
            }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [discard, isActive, pkDraft, save]);

    // -- Render ----------------------------------------------------------------

    if (loading) {
        return <div className='px-3 py-4 text-label text-muted-foreground'>Loading...</div>;
    }

    if (!supportsAlterPk) {
        return (
            <div className='px-3 py-3 text-label text-muted-foreground italic'>
                SQLite: primary key management via ALTER TABLE is not supported.
                {pk && (
                    <div className='mt-2 flex items-center gap-3'>
                        <span className=' text-small text-foreground font-medium'>{pk.name}</span>
                        <span className=' text-label text-muted-foreground'>
                            {pk.columns.join(', ')}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className='flex flex-col min-h-0'>
            <div className='px-3 py-2'>
                {!pk && !pkDraft && (
                    <p className='text-label text-muted-foreground italic py-2'>
                        No primary key defined.
                    </p>
                )}

                {pk && !pkDraft && (
                    <div className='flex items-center gap-3 py-1.5 group'>
                        <span
                            className=' text-small text-foreground font-medium min-w-[160px] truncate'
                            title={pk.name}
                        >
                            {pk.name}
                        </span>
                        <span className=' text-label text-muted-foreground flex-1 truncate'>
                            {pk.columns.join(', ')}
                        </span>
                        {!readOnlyMode && (
                            <Button
                                type='button'
                                variant='ghost'
                                onClick={() => dropConfirm.request(pk.name)}
                                disabled={saving}
                                className='h-6 px-2 text-label text-destructive/70 opacity-0 group-hover:opacity-100 transition-opacity ui-interactive-ghost-destructive'
                            >
                                <Trash2 size={11} />
                            </Button>
                        )}
                    </div>
                )}

                {pkDraft && (
                    <div className='flex items-center gap-2 py-1.5'>
                        <Input
                            autoFocus
                            placeholder='pk_constraint_name'
                            value={pkDraft.name}
                            onChange={e =>
                                setPkDraft(d => (d ? { ...d, name: e.target.value } : d))
                            }
                            className='rt-cell-input  min-w-40 w-40'
                        />
                        <div className='flex-1' onMouseDown={e => e.stopPropagation()}>
                            {editingCols ? (
                                <ColumnPickerCell
                                    columns={tableColumns}
                                    selected={pkDraft.columns}
                                    onChange={cols =>
                                        setPkDraft(d => (d ? { ...d, columns: cols } : d))
                                    }
                                    onClose={() => setEditingCols(false)}
                                    autoOpen
                                />
                            ) : (
                                <div
                                    className='text-label text-muted-foreground cursor-pointer px-2 py-1 rounded border border-border/60 ui-interactive-surface'
                                    onClick={() => setEditingCols(true)}
                                >
                                    {pkDraft.columns.length > 0 ? (
                                        pkDraft.columns.join(', ')
                                    ) : (
                                        <span className='italic text-muted-foreground/50'>
                                            click to select columns
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={discard}
                            className='h-6 px-2 text-label text-muted-foreground ui-interactive-surface'
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={dropConfirm.pending !== null}
                title='Drop Primary Key'
                description={`Drop primary key "${dropConfirm.pending}"?`}
                helperText='This will execute immediately and cannot be undone.'
                confirmLabel='Drop'
                destructive
                onCancel={dropConfirm.cancel}
                onConfirm={() => {
                    void dropConfirm.confirm(handleDropConfirm);
                }}
            />
            {modals}
        </div>
    );
};
