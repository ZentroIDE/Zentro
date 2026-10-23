// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { models } from '../../../wailsjs/go/models';
import {
    DraftRow,
    buildDisplayRows,
    buildInsertScript,
    getDraftDefaultValues,
    parseTableReference,
    resolveQualifiedTableName,
    toSqlLiteral,
} from '../../lib/dataEditing';
import { quoteIdent } from '../../lib/driverCapabilities';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useResultStore, TabResult } from '../../stores/resultStore';
import { useSchemaStore, type SchemaNode } from '../../stores/schemaStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToast } from '../../components/layout/Toast';
import { makeCellId, parseCellId } from './resultPanelUtils';

interface UseResultEditingOptions {
    tabId: string;
    result: TabResult | undefined;
}

const EMPTY_SCHEMA_TREE: SchemaNode[] = [];

export interface FocusCellRequest {
    rowKey: string;
    colIdx: number;
    nonce: number;
}

function toStringMap(input: unknown): Map<string, string> {
    if (input instanceof Map) return new Map(input as Map<string, string>);
    if (Array.isArray(input)) {
        try {
            return new Map(input as Array<[string, string]>);
        } catch {
            return new Map();
        }
    }
    return new Map();
}

function toNumberSet(input: unknown): Set<number> {
    if (input instanceof Set)
        return new Set(
            Array.from(input as Set<number>).filter(
                v => typeof v === 'number' && Number.isFinite(v),
            ),
        );
    if (Array.isArray(input))
        return new Set(
            (input as unknown[]).filter(
                (v): v is number => typeof v === 'number' && Number.isFinite(v),
            ),
        );
    return new Set();
}

function toDraftRows(input: unknown): DraftRow[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((row): row is DraftRow => Boolean(row && typeof row === 'object'))
        .map(row => ({
            ...row,
            values: Array.isArray(row.values) ? row.values.map(v => String(v ?? '')) : [],
            insertAfterRowIndex:
                typeof row.insertAfterRowIndex === 'number' || row.insertAfterRowIndex === null
                    ? row.insertAfterRowIndex
                    : null,
        }));
}

/**
 * Encapsulates all draft-row / cell-edit / delete state and derived helpers
 * for ResultPanel. Keeps the orchestrating component focused on layout.
 */
export function useResultEditing({ tabId, result }: UseResultEditingOptions) {
    const { viewMode } = useSettingsStore();
    const { activeProfile } = useConnectionStore();
    const driver = activeProfile?.driver;
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const activeProject = useProjectStore(state => state.activeProject);
    const checkAndFetchColumns = useSchemaStore(s => s.checkAndFetchColumns);
    const schemaTreeKey = React.useMemo(() => {
        const profileName = activeProfile?.name || '';
        const dbName = activeProfile?.db_name || '';
        return profileName && dbName ? `${profileName}:${dbName}` : '';
    }, [activeProfile?.db_name, activeProfile?.name]);
    const schemaTree = useSchemaStore(state =>
        schemaTreeKey ? (state.trees[schemaTreeKey] ?? EMPTY_SCHEMA_TREE) : EMPTY_SCHEMA_TREE,
    );
    const updatePendingState = useResultStore(s => s.updatePendingState);
    const applyEdits = useResultStore(s => s.applyEdits);
    const appendInsertedRows = useResultStore(s => s.appendInsertedRows);
    const { toast } = useToast();

    const [columnDefs, setColumnDefs] = React.useState<models.ColumnDef[]>([]);
    const [editedCells, setEditedCells] = React.useState<Map<string, string>>(() =>
        toStringMap(result?.pendingEdits),
    );
    const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
    const [selectedRowKeysFromHeader, setSelectedRowKeysFromHeader] = React.useState<Set<string>>(
        new Set(),
    );

    // Clear row header selection when user starts selecting cells
    React.useEffect(() => {
        if (selectedCells.size > 0) setSelectedRowKeysFromHeader(new Set());
    }, [selectedCells]);
    const [deletedRows, setDeletedRows] = React.useState<Set<number>>(() =>
        toNumberSet(result?.pendingDeletions),
    );
    const [draftRows, setDraftRows] = React.useState<DraftRow[]>(() =>
        toDraftRows(result?.pendingDraftRows),
    );
    const [isSavingDraftRows, setIsSavingDraftRows] = React.useState(false);
    const [focusCellRequest, setFocusCellRequest] = React.useState<FocusCellRequest | null>(null);

    // ── Derived ──────────────────────────────────────────────────────────────

    const sourceQuery = result?.lastExecutedQuery;
    const currentSchema = React.useMemo(() => {
        if (!activeProject) return '';
        const targetEnvironmentKey =
            activeEnvironmentKey ||
            activeProject.last_active_environment_key ||
            activeProject.default_environment_key;
        return (
            activeProject.environments?.find(
                environment => environment.key === targetEnvironmentKey,
            )?.last_schema || ''
        );
    }, [activeEnvironmentKey, activeProject]);
    const tableRef = React.useMemo(
        () =>
            parseTableReference(sourceQuery, result?.tableName, {
                fallbackSchema: currentSchema,
                schemas: schemaTree,
            }),
        [currentSchema, result?.tableName, schemaTree, sourceQuery],
    );
    const qualifiedTableName = React.useMemo(
        () =>
            resolveQualifiedTableName(
                sourceQuery,
                result?.tableName,
                {
                    fallbackSchema: currentSchema,
                    schemas: schemaTree,
                },
                driver,
            ),
        [currentSchema, driver, result?.tableName, schemaTree, sourceQuery],
    );
    const columnDefsByName = React.useMemo(
        () => new Map(columnDefs.map(col => [col.Name, col])),
        [columnDefs],
    );
    const displayRows = React.useMemo(
        () => buildDisplayRows(result?.rows || [], draftRows, result?.windowStartOffset ?? 0),
        [result?.rows, draftRows, result?.windowStartOffset],
    );
    const displayRowsByKey = React.useMemo(
        () => new Map(displayRows.map(row => [row.key, row])),
        [displayRows],
    );
    const rowOrder = React.useMemo(
        () => new Map(displayRows.map((row, index) => [row.key, index])),
        [displayRows],
    );
    // Row keys derived from cell selection (used for context/editing operations)
    const selectedRowKeysFromCells = React.useMemo(() => {
        const keys = new Set<string>();
        selectedCells.forEach(cellId => keys.add(parseCellId(cellId).rowKey));
        return Array.from(keys);
    }, [selectedCells]);
    // Merged: header selection takes priority; falls back to cell-derived keys
    const selectedRowKeys = React.useMemo(
        () =>
            selectedRowKeysFromHeader.size > 0
                ? Array.from(selectedRowKeysFromHeader)
                : selectedRowKeysFromCells,
        [selectedRowKeysFromHeader, selectedRowKeysFromCells],
    );
    const selectedPersistedRowIndices = React.useMemo(
        () =>
            selectedRowKeys
                .filter(k => k.startsWith('p:'))
                .map(k => Number(k.slice(2)))
                .filter(n => Number.isFinite(n)),
        [selectedRowKeys],
    );
    const selectedDraftIds = React.useMemo(
        () => selectedRowKeys.filter(k => k.startsWith('d:')).map(k => k.slice(2)),
        [selectedRowKeys],
    );
    const isEditable = Boolean(
        !viewMode &&
        result?.tableName &&
        result?.primaryKeys &&
        result.primaryKeys.length > 0 &&
        result.primaryKeys.every(pk => result.columns.includes(pk)),
    );
    const canManageDraftRows = Boolean(
        isEditable &&
        result?.columns.length &&
        qualifiedTableName &&
        (result?.windowStartOffset ?? 0) === 0,
    );
    const hasLegacyChanges = editedCells.size > 0 || deletedRows.size > 0;
    const hasPendingChanges = hasLegacyChanges || draftRows.length > 0;

    // ── Side-effects ─────────────────────────────────────────────────────────

    React.useEffect(() => {
        let cancelled = false;
        // Column defs drive the data-type icons/hints shown in the grid
        // header, not just edit affordances — fetch them whenever we know
        // the table, independent of `isEditable` (which is forced false in
        // View Mode). Gating on `isEditable` here made column types
        // disappear whenever View Mode was on.
        if (!activeProfile?.name || !activeProfile.db_name || !result?.tableName) {
            setColumnDefs([]);
            return;
        }
        checkAndFetchColumns(
            activeProfile.name,
            activeProfile.db_name,
            tableRef.schema,
            tableRef.table || result.tableName,
        )
            .then(cols => {
                if (!cancelled) setColumnDefs(cols || []);
            })
            .catch(() => {
                if (!cancelled) setColumnDefs([]);
            });
        return () => {
            cancelled = true;
        };
    }, [
        activeProfile?.db_name,
        activeProfile?.name,
        checkAndFetchColumns,
        result?.tableName,
        tableRef.schema,
        tableRef.table,
    ]);

    React.useEffect(() => {
        updatePendingState(tabId, editedCells, deletedRows, draftRows);
    }, [deletedRows, draftRows, editedCells, tabId, updatePendingState]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const queueFocusCell = React.useCallback((rowKey: string, colIdx = 0) => {
        setFocusCellRequest({ rowKey, colIdx, nonce: Date.now() });
    }, []);

    const removeDraftRows = React.useCallback((draftIds: string[]) => {
        if (draftIds.length === 0) return;
        const removedKeys = new Set(draftIds.map(id => `d:${id}`));
        setDraftRows(prev => prev.filter(dr => !removedKeys.has(`d:${dr.id}`)));
        setSelectedCells(
            prev =>
                new Set(
                    Array.from(prev).filter(cellId => !removedKeys.has(parseCellId(cellId).rowKey)),
                ),
        );
    }, []);

    const getPersistedRowValues = React.useCallback(
        (rowIndex: number): string[] => {
            if (!result) return [];
            const arrayIdx = rowIndex - (result.windowStartOffset ?? 0);
            return result.columns.map(
                (_, colIdx) =>
                    editedCells.get(`${rowIndex}:${colIdx}`) ??
                    result.rows[arrayIdx]?.[colIdx] ??
                    '',
            );
        },
        [editedCells, result],
    );

    const resetEditState = React.useCallback(() => {
        setEditedCells(new Map());
        setSelectedCells(new Set());
        setDeletedRows(new Set());
        setDraftRows([]);
        setFocusCellRequest(null);
    }, []);

    // ── Script generators ─────────────────────────────────────────────────────

    const generateUpdateScript = React.useCallback((): string => {
        if (
            !result?.primaryKeys ||
            !qualifiedTableName ||
            (editedCells.size === 0 && deletedRows.size === 0)
        )
            return '';

        const windowStart = result.windowStartOffset ?? 0;
        const statements: string[] = [];

        Array.from(deletedRows)
            .sort((a, b) => b - a)
            .forEach(logicalRowIdx => {
                const arrayIdx = logicalRowIdx - windowStart;
                const where = result
                    .primaryKeys!.map(pk => {
                        const colIndex = result.columns.indexOf(pk);
                        const base = result.rows[arrayIdx]?.[colIndex] ?? '';
                        return `${quoteIdent(pk, driver)} = ${toSqlLiteral(base, columnDefsByName.get(pk), driver)}`;
                    })
                    .join(' AND ');
                statements.push(`DELETE FROM ${qualifiedTableName} WHERE ${where};`);
            });

        const updatesByRow = new Map<number, { col: string; val: string }[]>();
        editedCells.forEach((value, cellId) => {
            const [logicalRowIdx, colIdx] = cellId.split(':').map(Number);
            if (deletedRows.has(logicalRowIdx)) return;
            const edits = updatesByRow.get(logicalRowIdx) || [];
            edits.push({ col: result.columns[colIdx], val: value });
            updatesByRow.set(logicalRowIdx, edits);
        });

        updatesByRow.forEach((edits, logicalRowIdx) => {
            const arrayIdx = logicalRowIdx - windowStart;
            const where = result
                .primaryKeys!.map(pk => {
                    const colIndex = result.columns.indexOf(pk);
                    const base = result.rows[arrayIdx]?.[colIndex] ?? '';
                    return `${quoteIdent(pk, driver)} = ${toSqlLiteral(base, columnDefsByName.get(pk), driver)}`;
                })
                .join(' AND ');
            const set = edits
                .map(
                    e =>
                        `${quoteIdent(e.col, driver)} = ${toSqlLiteral(e.val, columnDefsByName.get(e.col), driver)}`,
                )
                .join(', ');
            statements.push(`UPDATE ${qualifiedTableName} SET ${set} WHERE ${where};`);
        });

        return statements.join('\n');
    }, [columnDefsByName, deletedRows, driver, editedCells, qualifiedTableName, result]);

    const generateInsertScript = React.useCallback((): string => {
        if (!result || draftRows.length === 0 || !canManageDraftRows) return '';
        return buildInsertScript(
            result.tableName || tableRef.table,
            result.columns,
            draftRows,
            columnDefs,
            sourceQuery,
            {
                fallbackSchema: currentSchema,
                schemas: schemaTree,
            },
            driver,
        );
    }, [
        canManageDraftRows,
        columnDefs,
        currentSchema,
        draftRows,
        driver,
        result,
        schemaTree,
        sourceQuery,
        tableRef.table,
    ]);

    const generatePendingScript = React.useCallback((): string => {
        return [generateUpdateScript(), generateInsertScript()]
            .filter(s => s.trim().length > 0)
            .join('\n');
    }, [generateInsertScript, generateUpdateScript]);

    // ── Row actions ───────────────────────────────────────────────────────────

    const handleAddRow = React.useCallback(() => {
        if (!result || !canManageDraftRows) return;
        const draftRow: DraftRow = {
            id: crypto.randomUUID(),
            kind: 'new',
            values: getDraftDefaultValues(result.columns, columnDefs),
            insertAfterRowIndex: null,
        };
        setDraftRows(prev => [draftRow, ...prev]);
        setSelectedCells(new Set([makeCellId(`d:${draftRow.id}`, 0)]));
        queueFocusCell(`d:${draftRow.id}`, 0);
    }, [canManageDraftRows, columnDefs, queueFocusCell, result]);

    const handleDuplicateRows = React.useCallback(() => {
        if (!result || !canManageDraftRows) return;
        const selectedKeys = new Set(selectedRowKeys);
        const selected = displayRows.filter(
            row => row.kind === 'persisted' && selectedKeys.has(row.key),
        );
        if (selected.length === 0) return;

        const last = selected[selected.length - 1];
        const duplicated: DraftRow[] = selected.map(row => ({
            id: crypto.randomUUID(),
            kind: 'duplicate',
            values: getPersistedRowValues(row.persistedIndex as number),
            insertAfterRowIndex: last.persistedIndex ?? null,
            sourceRowIndex: row.persistedIndex,
        }));

        setDraftRows(prev => [...prev, ...duplicated]);
        setSelectedCells(new Set([makeCellId(`d:${duplicated[0].id}`, 0)]));
        queueFocusCell(`d:${duplicated[0].id}`, 0);
    }, [
        canManageDraftRows,
        displayRows,
        getPersistedRowValues,
        queueFocusCell,
        result,
        selectedRowKeys,
    ]);

    // ── Persist actions ───────────────────────────────────────────────────────

    const handleDirectExecute = React.useCallback(
        async (ExecuteUpdateSync: (script: string) => Promise<number>): Promise<boolean> => {
            if (viewMode) {
                toast.error('View Mode is enabled. Write actions are blocked.');
                return false;
            }
            const script = generatePendingScript();
            if (!script) return false;

            try {
                setIsSavingDraftRows(true);
                const affected = await ExecuteUpdateSync(script);
                if (editedCells.size > 0 || deletedRows.size > 0)
                    applyEdits(tabId, editedCells, deletedRows);
                if (draftRows.length > 0)
                    appendInsertedRows(
                        tabId,
                        draftRows.map(dr => [...dr.values]),
                    );
                resetEditState();
                toast.success(
                    `Saved successfully (${affected} row${affected !== 1 ? 's' : ''} affected).`,
                );
                return true;
            } catch (error: unknown) {
                toast.error(`Save failed: ${error}`);
                return false;
            } finally {
                setIsSavingDraftRows(false);
            }
        },
        [
            appendInsertedRows,
            applyEdits,
            deletedRows,
            draftRows,
            editedCells,
            generatePendingScript,
            resetEditState,
            tabId,
            toast,
            viewMode,
        ],
    );

    return {
        // State
        columnDefs,
        editedCells,
        setEditedCells,
        selectedCells,
        setSelectedCells,
        selectedRowKeysFromHeader,
        setSelectedRowKeysFromHeader,
        deletedRows,
        setDeletedRows,
        draftRows,
        setDraftRows,
        isSavingDraftRows,
        setIsSavingDraftRows,
        focusCellRequest,
        setFocusCellRequest,
        // Derived
        tableRef,
        qualifiedTableName,
        columnDefsByName,
        displayRows,
        displayRowsByKey,
        rowOrder,
        selectedRowKeys,
        selectedPersistedRowIndices,
        selectedDraftIds,
        isEditable,
        canManageDraftRows,
        hasLegacyChanges,
        hasPendingChanges,
        // Actions
        queueFocusCell,
        removeDraftRows,
        getPersistedRowValues,
        resetEditState,
        generateUpdateScript,
        generateInsertScript,
        generatePendingScript,
        handleAddRow,
        handleDuplicateRows,
        handleDirectExecute,
    };
}
