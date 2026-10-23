// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useState } from 'react';
import { quoteIdent } from '../../../lib/contextSearchTemplates';

import {
    analyzeOperationRisk,
    evaluateWriteSafetyDecision,
    WriteOperationKind,
} from '../../../lib/writeSafety/writeSafety';
import { resolveQueryPolicy } from '../../../lib/writeSafety/policy';
import { DOM_EVENT } from '../../../lib/constants';
import { emitCommand } from '../../../lib/commandBus';
import { getErrorMessage } from '../../../lib/errors';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { useSchemaStore } from '../../../stores/schemaStore';

import { buildPersistedColumnOrder, hasManualColumnReorder } from './columnOrder';
import { buildCreateTablePreviewLines } from './createTablePreview';
import { RowState } from './types';

interface UseTableInfoSaveArgs {
    activeEnvironmentKey?: string | null;
    activeProfileDbName?: string;
    activeConnectionID?: string;
    addTab: (input: {
        id?: string;
        type: 'table';
        name: string;
        content: string;
        query: string;
    }) => void;
    collectWriteGuard: (
        operations: WriteOperationKind[],
        actionLabel: string,
        previewLines?: string[],
    ) => Promise<{
        allowed: boolean;
        blockedReason?: string;
    }>;
    driver?: string;
    draftTableName: string;
    isCreateMode: boolean;
    loadInfo: (silent?: boolean) => Promise<void>;
    onSchemaChanged?: () => void;
    rows: RowState[];
    schema: string;
    tabId: string;
    table: string;
    toast: {
        error: (message: string) => void;
        success: (message: string) => void;
    };
    viewMode: boolean;
}

export interface TableInfoSaveResult {
    didSave: boolean;
    exitCreateMode?: boolean;
    rowErrors?: Record<number, string>;
}

export function useTableInfoSave({
    activeEnvironmentKey,
    activeProfileDbName,
    activeConnectionID,
    addTab,
    collectWriteGuard,
    draftTableName,
    driver,
    isCreateMode,
    loadInfo,
    onSchemaChanged,
    rows,
    schema,
    tabId,
    table,
    toast,
    viewMode,
}: UseTableInfoSaveArgs) {
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const formatColumnDefinition = useCallback(
        (column: RowState['current']) => {
            const parts = [quoteIdent(column.Name, driver), column.FullDataType || column.DataType];
            parts.push(column.IsNullable ? 'NULL' : 'NOT NULL');
            if (column.DefaultValue?.trim()) {
                parts.push(`DEFAULT ${column.DefaultValue.trim()}`);
            }
            return parts.join(' ');
        },
        [driver],
    );

    const buildPreviewLines = useCallback(() => {
        const qualifiedTable = `${quoteIdent(schema, driver)}.${quoteIdent(
            isCreateMode ? draftTableName.trim() || table : table,
            driver,
        )}`;

        if (isCreateMode) {
            const createColumns = rows
                .filter(row => !row.deleted)
                .map(row => row.current)
                .filter(column => column.Name.trim().length > 0);

            return buildCreateTablePreviewLines(
                driver,
                schema,
                draftTableName.trim() || table,
                createColumns,
            );
        }

        const lines: string[] = [];
        rows.forEach(row => {
            if (row.deleted) {
                lines.push(
                    `ALTER TABLE ${qualifiedTable} DROP COLUMN ${quoteIdent(row.original.Name, driver)};`,
                );
                return;
            }

            if (row.isNew) {
                lines.push(
                    `ALTER TABLE ${qualifiedTable} ADD COLUMN ${formatColumnDefinition(row.current)};`,
                );
                return;
            }

            if (JSON.stringify(row.original) !== JSON.stringify(row.current)) {
                if (row.original.Name !== row.current.Name) {
                    lines.push(
                        `ALTER TABLE ${qualifiedTable} RENAME COLUMN ${quoteIdent(row.original.Name, driver)} TO ${quoteIdent(row.current.Name, driver)};`,
                    );
                }

                if (
                    row.original.DataType !== row.current.DataType ||
                    row.original.IsNullable !== row.current.IsNullable ||
                    row.original.DefaultValue !== row.current.DefaultValue
                ) {
                    lines.push(
                        `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${formatColumnDefinition(row.current)};`,
                    );
                }
            }
        });

        return lines;
    }, [draftTableName, driver, formatColumnDefinition, isCreateMode, rows, schema, table]);

    const performSave = useCallback(async (): Promise<TableInfoSaveResult> => {
        if (viewMode) return { didSave: false };

        if (isCreateMode) {
            if (!activeConnectionID) {
                toast.error('No active connection');
                return { didSave: false };
            }

            const nextTableName = draftTableName.trim();
            if (!schema || !nextTableName) {
                toast.error('Invalid table target');
                return { didSave: false };
            }

            const nextQualifiedName = `${schema}.${nextTableName}`;
            const createColumns = rows
                .filter(row => !row.deleted)
                .map(row => row.current)
                .filter(column => column.Name.trim().length > 0);

            if (createColumns.length === 0) {
                toast.error('At least one column is required');
                return { didSave: false };
            }

            setSaving(true);
            try {
                unwrapOrThrow(
                    await getApiGateway().schema.createTable(
                        activeConnectionID,
                        activeProfileDbName || '',
                        schema,
                        nextTableName,
                        createColumns,
                    ),
                );
                if (activeProfileDbName) {
                    unwrapOrThrow(
                        await getApiGateway().schema.fetchDatabaseSchema(
                            activeConnectionID,
                            activeProfileDbName,
                        ),
                    );
                }
                emitCommand(DOM_EVENT.REFRESH_DATABASE_EXPLORER, { silent: true });
                addTab({
                    id: tabId,
                    type: 'table',
                    name: nextQualifiedName,
                    content: nextQualifiedName,
                    query: '',
                });
                toast.success(`Table "${nextQualifiedName}" created successfully`);
                return { didSave: true, exitCreateMode: true };
            } catch (error: unknown) {
                toast.error(getErrorMessage(error));
                return { didSave: false };
            } finally {
                setSaving(false);
            }
        }

        setSaving(true);
        const rowErrors: Record<number, string> = {};
        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    if (row.deleted) {
                        unwrapOrThrow(
                            await getApiGateway().schema.dropTableColumn(
                                activeConnectionID || '',
                                activeProfileDbName || '',
                                schema,
                                table,
                                row.original.Name,
                            ),
                        );
                    } else if (row.isNew) {
                        unwrapOrThrow(
                            await getApiGateway().schema.addTableColumn(
                                activeConnectionID || '',
                                activeProfileDbName || '',
                                schema,
                                table,
                                row.current,
                            ),
                        );
                    } else if (JSON.stringify(row.original) !== JSON.stringify(row.current)) {
                        unwrapOrThrow(
                            await getApiGateway().schema.alterTableColumn(
                                activeConnectionID || '',
                                activeProfileDbName || '',
                                schema,
                                table,
                                row.original,
                                row.current,
                            ),
                        );
                    }
                } catch (error: unknown) {
                    rowErrors[i] = getErrorMessage(error);
                }
            }

            if (!Object.keys(rowErrors).length && hasManualColumnReorder(rows)) {
                try {
                    unwrapOrThrow(
                        await getApiGateway().schema.reorderTableColumns(
                            activeConnectionID || '',
                            activeProfileDbName || '',
                            schema,
                            table,
                            buildPersistedColumnOrder(rows),
                        ),
                    );
                } catch (error: unknown) {
                    toast.error(getErrorMessage(error));
                    return { didSave: true, rowErrors };
                }
            }

            if (!Object.keys(rowErrors).length) {
                if (activeConnectionID && activeProfileDbName) {
                    unwrapOrThrow(
                        await getApiGateway().schema.fetchDatabaseSchema(
                            activeConnectionID,
                            activeProfileDbName,
                        ),
                    );
                }
                // The columns on the server just changed, so the cached column
                // metadata for this connection is stale by definition. Clear it
                // before the reload below (which reads through that cache), and
                // before any other tab can read the pre-edit column set.
                if (activeConnectionID && activeProfileDbName) {
                    useSchemaStore
                        .getState()
                        .clearColumnCacheForDatabase(activeConnectionID, activeProfileDbName);
                }
                await loadInfo(true);
                onSchemaChanged?.();
            }

            return { didSave: true, rowErrors };
        } finally {
            setSaving(false);
        }
    }, [
        activeProfileDbName,
        activeConnectionID,
        addTab,
        draftTableName,
        isCreateMode,
        loadInfo,
        onSchemaChanged,
        rows,
        schema,
        tabId,
        table,
        toast,
        viewMode,
    ]);

    const collectWriteOperations = useCallback((): WriteOperationKind[] => {
        if (isCreateMode) {
            return [WriteOperationKind.CREATE];
        }

        const operations: WriteOperationKind[] = [];
        rows.forEach(row => {
            if (row.deleted) {
                operations.push(WriteOperationKind.DROP);
                return;
            }
            if (row.isNew) {
                operations.push(WriteOperationKind.CREATE);
                return;
            }
            if (JSON.stringify(row.original) !== JSON.stringify(row.current)) {
                operations.push(WriteOperationKind.ALTER);
            }
        });
        return operations;
    }, [isCreateMode, rows]);

    const confirmSafetyAndSave = useCallback(async (): Promise<TableInfoSaveResult> => {
        const operations = collectWriteOperations();
        if (operations.length > 0) {
            const guard = await collectWriteGuard(
                operations,
                'Apply Table Schema Changes',
                buildPreviewLines(),
            );
            if (!guard.allowed) {
                if (guard.blockedReason) toast.error(guard.blockedReason);
                return { didSave: false };
            }
        }
        return performSave();
    }, [buildPreviewLines, collectWriteGuard, collectWriteOperations, performSave, toast]);

    const saveAll = useCallback(async (): Promise<TableInfoSaveResult> => {
        if (viewMode) return { didSave: false };
        if (isCreateMode) {
            return confirmSafetyAndSave();
        }

        const operations = collectWriteOperations();
        const deletedCount = rows.filter(row => row.deleted).length;
        if (deletedCount > 0) {
            const policy = resolveQueryPolicy(activeEnvironmentKey || undefined);
            const decision = evaluateWriteSafetyDecision({
                analysis: analyzeOperationRisk(operations),
                actionLabel: 'Apply Table Schema Changes',
                environmentKey: activeEnvironmentKey || undefined,
                safetyLevel: policy.safetyLevel,
            });

            if (decision.action === 'allow') {
                setShowDeleteConfirm(true);
                return { didSave: false };
            }
        }

        return confirmSafetyAndSave();
    }, [
        activeEnvironmentKey,
        collectWriteOperations,
        confirmSafetyAndSave,
        isCreateMode,
        rows,
        viewMode,
    ]);

    return {
        saving,
        showDeleteConfirm,
        setShowDeleteConfirm,
        confirmSafetyAndSave,
        saveAll,
    };
}
