// SPDX-License-Identifier: GPL-3.0-only

import { getDriverCapabilities } from '../../../lib/driverCapabilities';
import { DOM_EVENT, DRIVER } from '../../../lib/constants';
import { emitCommand, onCommand } from '../../../lib/commandBus';
import { consumeErdReveal } from '../../../lib/focusZoneReveal';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { Info } from 'lucide-react';

import { models } from '../../../../wailsjs/go/models';
import { getTypesForDriver } from '../../../lib/dbTypes';
import { getErrorMessage } from '../../../lib/errors';
import { buildFilterOrderQuery } from '../../../lib/queryBuilder';
import { parseTableTarget } from '../../../lib/tableTargets';
import { buildConnectionIdentityKey } from '../../../lib/connectionIdentity';
import { createTableTab } from '../../../lib/tabFactory';
import { setClipboardText } from '../../../services/clipboardService';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { useEditorStore } from '../../../stores/editorStore';
import { useImageColumnStore } from '../../../stores/imageColumnStore';
import { useResultStore } from '../../../stores/resultStore';
import { useSchemaStore } from '../../../stores/schemaStore';
import { useTableTabConnectionPin } from './useTableTabConnectionPin';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import { useToast } from '../../../components/layout/Toast';
import { ConfirmActionDialog } from '../../../components/shared/ConfirmActionDialog';
import { Button, ConfirmDialog } from '../../../components/ui';

import { getColumnsDirtyCount, getDataDirtyCount } from './changeBadge';
import { ResultPanel } from '../ResultPanel';
import { DDLInfoView } from './DDLInfoView';
import { DEFAULT_KEYS_TAB, KeysView, type KeysPanelId } from './KeysView';
import { RelationshipView } from './RelationshipView';
import { SchemaInfoView } from './SchemaInfoView';
import { TableInfoHeader } from './TableInfoHeader';
import { SortCol, SortDir, TableInfoTab, TabAction } from './types';
import { useTableColumnEditor } from './useTableColumnEditor';
import { useTableInfoAutoRetry } from './useTableInfoAutoRetry';
import { useTableInfoExportBridge } from './useTableInfoExportBridge';
import { useTableInfoKeyboardShortcuts } from './useTableInfoKeyboardShortcuts';
import { useTableInfoSave } from './useTableInfoSave';
import { useTableInfoTabs } from './useTableInfoTabs';
import { withEditableColumnType } from './editableColumnType';
import { applySchemaRefreshRevision } from './schemaRefreshQuery';
import { UnsavedChangesBanner } from '../UnsavedChangesBanner';
import { getTableInfoDirtySummary } from './tableInfoDirtyState';
import { registerTableInfoCloseController } from './tableInfoCloseRegistry';
import { logClientEvent } from '../../../lib/clientEventLog';

interface TableInfoProps {
    tabId: string;
    tableName: string;
}

const TableInfoComponent: React.FC<TableInfoProps> = ({ tabId, tableName }) => {
    const [loading, setLoading] = useState(true);
    const [reloading, setReloading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TableInfoTab>(
        parseTableTarget(tableName).isCreateDraft ? 'columns' : 'data',
    );
    const [sortCol, setSortCol] = useState<SortCol>('idx');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [filterCol, setFilterCol] = useState('');
    const [dataTabActions, setDataTabActions] = useState<TabAction[]>([]);
    const [keysTabActions, setKeysTabActions] = useState<TabAction[]>([]);
    const [keysDirtyCount, setKeysDirtyCount] = useState(0);
    const [ddlTabActions, setDdlTabActions] = useState<TabAction[]>([]);
    const [keysActiveTab, setKeysActiveTab] = useState<KeysPanelId>(DEFAULT_KEYS_TAB);
    const [erdRefreshKey, setErdRefreshKey] = useState(0);
    const [infoRefreshKey, setInfoRefreshKey] = useState(0);
    const [isCreateMode, setIsCreateMode] = useState(parseTableTarget(tableName).isCreateDraft);
    const [draftTableName, setDraftTableName] = useState(
        parseTableTarget(tableName).table || 'new_table',
    );
    const [closePending, setClosePending] = useState(false);
    const [keysReloadConfirmOpen, setKeysReloadConfirmOpen] = useState(false);

    const filterInputRef = useRef<HTMLInputElement>(null);
    const createNameInputRef = useRef<HTMLInputElement>(null);
    const createNameAutoSelectedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const latestLoadRequestRef = useRef(0);
    const loadDataRef = useRef<typeof loadData | null>(null);
    const initialDataLoadRequestedRef = useRef(false);
    const filterTabs = useMemo<Set<TableInfoTab>>(() => new Set(['columns']), []);

    // Pinned Environment (ADR-0001) — captured once when this tab was
    // opened (see createTableTab, useExplorerActions.ts), immutable for the
    // tab's life. Table tabs never read the ambient connectionStore/
    // environmentStore — those drive Query tabs only.
    const pinnedConnection = useEditorStore(
        state =>
            state.groups.flatMap(group => group.tabs).find(tab => tab.id === tabId)?.connection,
    );
    const pinStatus = useTableTabConnectionPin(tabId, pinnedConnection);
    const isConnected = pinStatus === 'ready';
    const addTab = useEditorStore(state => state.addTab);
    const setActiveGroupId = useEditorStore(state => state.setActiveGroupId);
    const setActiveTabId = useEditorStore(state => state.setActiveTabId);
    const tabGroupId = useEditorStore(
        state => state.groups.find(group => group.tabs.some(tab => tab.id === tabId))?.id ?? null,
    );
    const viewMode = useSettingsStore(state => state.viewMode);
    const clearResult = useResultStore(state => state.clearResult);
    const isTableTabActive = useEditorStore(state => {
        const activeGroup = state.groups.find(group => group.id === state.activeGroupId);
        return activeGroup?.activeTabId === tabId;
    });

    useEffect(() => {
        if (!isTableTabActive || isCreateMode) return;
        if (consumeErdReveal()) setActiveTab('erd');
        return onCommand(DOM_EVENT.FOCUS_ZONE, payload => {
            if (payload?.zoneId !== 'erd') return;
            consumeErdReveal();
            setActiveTab('erd');
        });
    }, [isCreateMode, isTableTabActive]);
    const { toast } = useToast();

    const driver = pinnedConnection?.driver ?? DRIVER.SQLSERVER;
    const types = getTypesForDriver(driver);
    const target = useMemo(() => parseTableTarget(tableName), [tableName]);
    const { schema, table } = target;

    // Temporary diagnostic aid for the table-tab-open latency investigation
    // (see ADR-0001 follow-up) — marks when this tab actually mounted, so
    // the click-to-data-loaded timeline in the app log has a start point.
    const mountLoggedRef = useRef(false);
    useEffect(() => {
        if (mountLoggedRef.current) return;
        mountLoggedRef.current = true;
        logClientEvent('table-tab.mount', {
            tabId,
            schema,
            table,
            connectionID: pinnedConnection?.connectionID || '',
            dbName: pinnedConnection?.dbName || '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Temporary diagnostic aid — no deps array, so this runs after EVERY
    // commit (not just mount), to directly test whether this tab keeps
    // re-rendering from clicks/state changes elsewhere in the app that have
    // nothing to do with it. Throttled to every 5th render past the first
    // so it doesn't spam the log on its own legitimate re-renders (e.g.
    // while a query is streaming in row chunks).
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;
    useEffect(() => {
        if (renderCountRef.current > 1 && renderCountRef.current % 5 === 0) {
            logClientEvent('table-tab.render-count', {
                tabId,
                count: String(renderCountRef.current),
            });
        }
    });

    const dataConnectionKey = pinnedConnection
        ? buildConnectionIdentityKey(pinnedConnection.connectionID, pinnedConnection.dbName, driver)
        : undefined;
    useEffect(() => {
        if (!dataConnectionKey) return;
        void useImageColumnStore.getState().loadForConnection(dataConnectionKey);
    }, [dataConnectionKey]);

    const dataTabId = `data-${tabId}`;
    const [dataQueryRevision, setDataQueryRevision] = useState(0);
    const dataResult = useResultStore(state => state.results[dataTabId]);

    const handleCopyPreviewScript = useCallback(
        (script: string) => {
            void setClipboardText(script)
                .then(() => toast.success('Script copied to clipboard'))
                .catch(() => toast.error('Failed to copy script'));
        },
        [toast],
    );

    const handleOpenPreviewScriptInNewTab = useCallback(
        (script: string) => {
            addTab({
                name: `Apply ${schema}.${table}`,
                query: script,
            });
            toast.success('Script opened in a new tab.');
        },
        [addTab, schema, table, toast],
    );

    const writeSafetyGuardOptions = useMemo(
        () => ({
            onCopyScript: handleCopyPreviewScript,
            onOpenScriptInNewTab: handleOpenPreviewScriptInNewTab,
        }),
        [handleCopyPreviewScript, handleOpenPreviewScriptInNewTab],
    );
    const writeSafetyGuard = useWriteSafetyGuard(
        pinnedConnection?.environmentKey,
        writeSafetyGuardOptions,
    );

    const {
        rows,
        setRows,
        rowErrors,
        setRowErrors,
        editCell,
        setEditCell,
        selectedRows,
        setSelectedRows,
        handleRowMouseDown,
        handleRowMouseEnter,
        toggleDeleteRows,
        updateRow,
        discardRow,
        discardAll,
        addColumn,
    } = useTableColumnEditor({
        activeTab,
        driver,
        viewMode,
    });

    useEffect(() => {
        setIsCreateMode(target.isCreateDraft);
    }, [target.isCreateDraft]);

    useEffect(() => {
        setDraftTableName(target.table || 'new_table');
    }, [target.table]);

    useEffect(() => {
        if (!isCreateMode) {
            createNameAutoSelectedRef.current = false;
            return;
        }
        if (!isTableTabActive || createNameAutoSelectedRef.current) return;

        const timer = window.setTimeout(() => {
            const input = createNameInputRef.current;
            if (!input) return;
            input.focus();
            input.select();
            createNameAutoSelectedRef.current = true;
        }, 0);

        return () => window.clearTimeout(timer);
    }, [isCreateMode, isTableTabActive]);

    useEffect(() => {
        if (isCreateMode && activeTab !== 'columns') {
            setActiveTab('columns');
        }
    }, [activeTab, isCreateMode]);

    const loadInfo = useCallback(
        async (silent = false) => {
            if (isCreateMode) {
                setLoading(false);
                setReloading(false);
                setFetchError(null);
                setRows(prev => {
                    if (prev.length > 0) return prev;
                    const defaultIdType = getDriverCapabilities(driver).defaultIdColumnType;
                    const initialColumn: models.ColumnDef = {
                        Name: 'id',
                        DataType: defaultIdType,
                        FullDataType: defaultIdType,
                        DefaultValue: '',
                        IsNullable: false,
                        IsPrimaryKey: true,
                    };
                    return [
                        {
                            id: 'new-id',
                            original: { ...initialColumn },
                            current: { ...initialColumn },
                            deleted: false,
                            isNew: true,
                        },
                    ];
                });
                setRowErrors({});
                return;
            }

            const requestId = latestLoadRequestRef.current + 1;
            latestLoadRequestRef.current = requestId;

            try {
                if (silent) setReloading(true);
                else setLoading(true);
                if (!silent) setFetchError(null);
                // Goes through the schema store rather than the gateway so the
                // per-table column fetch is deduped and cached. Calling
                // FetchTableColumns directly here meant every loadInfo() — the
                // mount effect, a silent retry, and the save hook's reload —
                // issued its own backend round trip for identical data.
                // `silent` is the explicit user-triggered reload (Refresh/F5),
                // so it bypasses the TTL to pick up out-of-band schema changes
                // while still joining any request already in flight. The store
                // resolves a failed fetch to `[]`, so the failure has to be
                // reported through onError for setFetchError — and with it the
                // transient-connection auto-retry — to still fire.
                let fetchFailed = false;
                const cols = await useSchemaStore
                    .getState()
                    .checkAndFetchColumns(
                        pinnedConnection?.connectionID || '',
                        pinnedConnection?.dbName || '',
                        schema,
                        table,
                        {
                            force: silent,
                            onError: () => {
                                fetchFailed = true;
                            },
                        },
                    );
                if (latestLoadRequestRef.current !== requestId) return;
                setRows(
                    (cols || []).map((column, idx) => ({
                        id: `col-${idx}-${column.Name}`,
                        original: withEditableColumnType(column),
                        current: withEditableColumnType(column),
                        deleted: false,
                        originalIndex: idx,
                    })),
                );
                setRowErrors({});
                // Only on success: a failed fetch resolved to an empty column
                // list, and clearing the error here would silently swallow it.
                if (!fetchFailed) setFetchError(null);
            } catch (error: unknown) {
                if (latestLoadRequestRef.current !== requestId) return;
                setFetchError(getErrorMessage(error));
            } finally {
                if (latestLoadRequestRef.current !== requestId) return;
                setLoading(false);
                setReloading(false);
            }
        },
        [
            pinnedConnection?.connectionID,
            pinnedConnection?.dbName,
            driver,
            isCreateMode,
            schema,
            setRowErrors,
            setRows,
            table,
        ],
    );

    // Dialect-correct base query (ADR-0001): quoted per the Pinned
    // Environment's driver (double quotes for Postgres/MSSQL/SQLite,
    // backticks for MySQL) via BuildQualifiedTableSelect, not hardcoded
    // ANSI syntax — a mixed-engine project's table tab must never send
    // double-quote-quoted SQL to a MySQL connection. Defaults to the ANSI
    // form synchronously so the first render has something to show, then
    // upgrades once the backend call resolves.
    const [qualifiedBaseQuery, setQualifiedBaseQuery] = useState(
        () => `SELECT * FROM "${schema}"."${table}"`,
    );
    useEffect(() => {
        setQualifiedBaseQuery(`SELECT * FROM "${schema}"."${table}"`);
        if (!pinnedConnection?.connectionID) return;
        let cancelled = false;
        getApiGateway()
            .schema.buildQualifiedTableSelect(pinnedConnection.connectionID, schema, table)
            .then(result => {
                if (!cancelled && result.ok) setQualifiedBaseQuery(result.data);
            });
        return () => {
            cancelled = true;
        };
    }, [pinnedConnection?.connectionID, schema, table]);

    const loadData = useCallback(
        async (filter = '', orderByExpr = '', filterBaseQuery?: string) => {
            if (isCreateMode) return;
            const providedBaseQuery = (filterBaseQuery || '').trim();
            const baseQuery = applySchemaRefreshRevision(
                providedBaseQuery || qualifiedBaseQuery,
                dataQueryRevision,
            );
            const query = buildFilterOrderQuery(baseQuery, filter, orderByExpr);
            // Don't set lastExecutedQuery here — the backend's QueryStarted
            // event (handled in useAppEventBridge.ts) sets the definitive
            // value moments later anyway, with the actual executed text
            // (including the schema-revision comment). Setting it twice with
            // two different strings changes ResultPanelToolbar's `key` twice
            // per reload, forcing ResultFilterBar to remount and lose focus.
            const execution = pinnedConnection
                ? getApiGateway().query.executePinnedQuery(
                      dataTabId,
                      query,
                      pinnedConnection.connectionID,
                      pinnedConnection.dbName,
                  )
                : getApiGateway().query.execute(dataTabId, query);
            execution.then(result => {
                if (!result.ok) console.error(result.error.message);
            });
        },
        [dataQueryRevision, dataTabId, isCreateMode, pinnedConnection, qualifiedBaseQuery],
    );

    const dataTabCanonicalBaseQuery = qualifiedBaseQuery;

    const dataFallbackPrimaryKeys = useMemo(
        () =>
            rows
                .map(row => row.current)
                .filter(col => col.IsPrimaryKey)
                .map(col => col.Name)
                .filter(name => name.trim().length > 0),
        [rows],
    );

    // Stabilized by content, not just by `rows` reference: `rows` gets a new
    // array on every column-editor interaction (cell edits, sorting, etc.),
    // even when the column NAMES haven't changed. Without this, the filter
    // bar's completion provider (keyed off this array's identity, see
    // useFilterMonacoSetup) would tear down and rebuild on every such
    // interaction — disrupting an open suggestion widget mid-navigation, a
    // problem the editor's own query tabs don't have since their filter
    // bar's columns come from the stable `result.columns` instead.
    const dataFallbackColumnsRef = useRef<string[]>([]);
    const dataFallbackColumns = useMemo(() => {
        const next = rows.map(row => row.current.Name).filter(name => name.trim().length > 0);
        const prev = dataFallbackColumnsRef.current;
        if (prev.length === next.length && prev.every((name, index) => name === next[index])) {
            return prev;
        }
        dataFallbackColumnsRef.current = next;
        return next;
    }, [rows]);

    const resolvedDataResult = useMemo(() => {
        if (!dataResult) return dataResult;
        return {
            ...dataResult,
            tableName: dataResult.tableName || table,
            primaryKeys:
                dataResult.primaryKeys && dataResult.primaryKeys.length > 0
                    ? dataResult.primaryKeys
                    : dataFallbackPrimaryKeys,
            columns: dataResult.columns.length > 0 ? dataResult.columns : dataFallbackColumns,
        };
    }, [dataFallbackColumns, dataFallbackPrimaryKeys, dataResult, table]);

    const handleDataFilterRun = useCallback(
        (filter: string, orderByExpr?: string) => {
            void loadData(filter, orderByExpr, dataTabCanonicalBaseQuery);
        },
        [dataTabCanonicalBaseQuery, loadData],
    );

    // Keep ref in sync so the effect below can call the latest loadData
    // without adding it to effect deps (which change on every activeGroupId update).
    loadDataRef.current = loadData;

    useEffect(() => {
        if (!isConnected || !isTableTabActive || activeTab !== 'data' || dataResult) return;
        if (initialDataLoadRequestedRef.current) return;

        initialDataLoadRequestedRef.current = true;
        // Temporary diagnostic aid (see mount log above) — marks when the
        // initial data query for this tab was actually dispatched.
        logClientEvent('table-tab.data.start', { tabId, dataTabId });
        void loadDataRef.current?.();
    }, [activeTab, dataResult, isConnected, isTableTabActive, dataTabId, tabId]);

    // Temporary diagnostic aid (see mount log above) — marks when the
    // initial data query's result first landed, closing the
    // click-to-data-loaded timeline for this tab.
    const dataLoadedLoggedRef = useRef(false);
    useEffect(() => {
        if (dataResult && !dataLoadedLoggedRef.current) {
            dataLoadedLoggedRef.current = true;
            logClientEvent('table-tab.data.done', {
                tabId,
                dataTabId,
                rows: String(dataResult.rows.length),
            });
        }
    }, [dataResult, dataTabId, tabId]);

    useEffect(() => {
        if (dataResult) {
            initialDataLoadRequestedRef.current = false;
            return;
        }
        if (activeTab !== 'data' || !isTableTabActive || !isConnected) {
            initialDataLoadRequestedRef.current = false;
        }
    }, [activeTab, dataResult, isConnected, isTableTabActive]);

    useTableInfoExportBridge({
        tabId,
        dataTabId,
        activeTab,
        dataResult,
        loadData: () => loadData(),
        setActiveTab,
    });

    const loadErd = useCallback(async () => setErdRefreshKey(key => key + 1), []);
    const handleErdCountChange = useCallback((_count: number | null) => {}, []);
    const tabReload: Record<TableInfoTab, () => void> = useMemo(
        () => ({
            columns: () => {
                void loadInfo(true);
            },
            // ResultPanel owns reload (it knows the current WHERE / ORDER BY).
            data: () => emitCommand(DOM_EVENT.RELOAD_RESULT, { tabId: dataTabId }),
            erd: () => {
                void loadErd();
            },
            keys: () => {
                // A reload refetches all four keys panels and silently wipes
                // any pending drafts — confirm first when something is dirty.
                if (keysDirtyCount > 0) {
                    setKeysReloadConfirmOpen(true);
                    return;
                }
                setInfoRefreshKey(key => key + 1);
            },
            ddl: () => setInfoRefreshKey(key => key + 1),
        }),
        [dataTabId, keysDirtyCount, loadErd, loadInfo],
    );

    useEffect(() => {
        void loadInfo();
    }, [loadInfo]);

    // No env-switch reload effect here by design (ADR-0001): this tab is
    // pinned to its own connection for life, so the Toolbar's Active
    // Environment switching elsewhere in the app must never trigger a
    // reload or retarget here.

    useTableInfoAutoRetry({
        fetchError,
        isTableTabActive: Boolean(isTableTabActive),
        loading,
        reloading,
        onRetry: () => {
            void loadInfo(true);
        },
    });

    const { saving, showDeleteConfirm, setShowDeleteConfirm, confirmSafetyAndSave, saveAll } =
        useTableInfoSave({
            activeEnvironmentKey: pinnedConnection?.environmentKey,
            activeProfileDbName: pinnedConnection?.dbName,
            activeConnectionID: pinnedConnection?.connectionID,
            addTab,
            collectWriteGuard: (operations, actionLabel, previewLines) =>
                writeSafetyGuard.guardOperations(operations, actionLabel, previewLines),
            draftTableName,
            driver,
            isCreateMode,
            loadInfo,
            onSchemaChanged: () => {
                initialDataLoadRequestedRef.current = false;
                setDataQueryRevision(prev => prev + 1);
                clearResult(dataTabId);
            },
            rows,
            schema,
            tabId,
            table,
            toast,
            viewMode,
        });

    const saveColumns = useCallback(async () => {
        const result = await saveAll();
        if (result?.exitCreateMode) {
            setIsCreateMode(false);
        }
        if (result?.rowErrors) {
            setRowErrors(result.rowErrors);
        }
        return result;
    }, [saveAll, setRowErrors]);

    const columnsDirtyCount = useMemo(() => getColumnsDirtyCount(rows), [rows]);
    const dataDirtyCount = useMemo(() => getDataDirtyCount(dataResult), [dataResult]);
    const draftTableNameDirty =
        isCreateMode && draftTableName.trim() !== (target.table || 'new_table');
    const dirtySummary = useMemo(
        () =>
            getTableInfoDirtySummary({
                columnsDirtyCount,
                dataDirtyCount,
                keysDirtyCount,
                draftTableNameDirty,
            }),
        [columnsDirtyCount, dataDirtyCount, draftTableNameDirty, keysDirtyCount],
    );
    const hasChanges = dirtySummary.hasChanges;
    const canHandleCloseRequest = useMemo(() => {
        if (!hasChanges || viewMode) return false;
        const hasColumnActions = columnsDirtyCount > 0 || draftTableNameDirty;
        const hasDataActions =
            dataDirtyCount > 0 &&
            dataTabActions.some(action => action.id === 'save' && !action.disabled) &&
            dataTabActions.some(action => action.id === 'discard' && !action.disabled);
        const hasKeyActions =
            keysDirtyCount > 0 &&
            keysTabActions.some(action => action.id.includes('save') && !action.disabled) &&
            keysTabActions.some(action => action.id.includes('discard') && !action.disabled);
        return hasColumnActions || hasDataActions || hasKeyActions;
    }, [
        columnsDirtyCount,
        dataDirtyCount,
        dataTabActions,
        draftTableNameDirty,
        hasChanges,
        keysDirtyCount,
        keysTabActions,
        viewMode,
    ]);

    const closeTableTab = useCallback(() => {
        const editorState = useEditorStore.getState();
        const group = editorState.groups.find(currentGroup =>
            currentGroup.tabs.some(tab => tab.id === tabId),
        );
        if (!group) return;
        editorState.removeTab(tabId, group.id);
    }, [tabId]);

    const triggerAction = useCallback(async (actionId: string, actions: TabAction[]) => {
        const action = actions.find(item => item.id === actionId);
        if (!action || action.disabled) return false;
        const result = action.onClick?.();
        if (result instanceof Promise) {
            await result;
        }
        return true;
    }, []);

    const saveWorkspaceChanges = useCallback(async () => {
        let savedAny = false;
        const dataSaveAction = dataTabActions.find(
            action => action.id === 'save' && !action.disabled,
        );
        const keysSaveActions = keysTabActions.filter(
            action => action.id.includes('save') && !action.disabled,
        );

        if (dataDirtyCount > 0 && !dataSaveAction) {
            return { savedAny: false, blocked: true as const };
        }
        if (keysDirtyCount > 0 && keysSaveActions.length === 0) {
            return { savedAny: false, blocked: true as const };
        }

        if (columnsDirtyCount > 0 || draftTableNameDirty) {
            const result = await saveColumns();
            if (!result?.didSave) {
                return { savedAny: false, blocked: true as const };
            }
            savedAny = true;
            if (result?.rowErrors) {
                return { savedAny, blocked: true as const };
            }
        }

        if (dataDirtyCount > 0) {
            const saved = await triggerAction('save', dataTabActions);
            if (!saved) {
                return { savedAny: false, blocked: true as const };
            }
            savedAny = true;
        }

        if (keysDirtyCount > 0) {
            for (const action of keysSaveActions) {
                const result = action.onClick?.();
                if (result instanceof Promise) {
                    await result;
                }
                savedAny = true;
            }
        }

        return { savedAny, blocked: false as const };
    }, [
        columnsDirtyCount,
        dataDirtyCount,
        dataTabActions,
        draftTableNameDirty,
        keysDirtyCount,
        keysTabActions,
        saveColumns,
        triggerAction,
    ]);

    const discardWorkspaceChanges = useCallback(async () => {
        const dataDiscardAction = dataTabActions.find(
            action => action.id === 'discard' && !action.disabled,
        );
        const keysDiscardActions = keysTabActions.filter(
            action => action.id.includes('discard') && !action.disabled,
        );

        if (dataDirtyCount > 0 && !dataDiscardAction) {
            return { blocked: true as const };
        }
        if (keysDirtyCount > 0 && keysDiscardActions.length === 0) {
            return { blocked: true as const };
        }

        if (columnsDirtyCount > 0 || draftTableNameDirty) {
            discardAll();
        }

        if (dataDirtyCount > 0) {
            const discarded = await triggerAction('discard', dataTabActions);
            if (!discarded) {
                return { blocked: true as const };
            }
        }

        if (keysDirtyCount > 0) {
            for (const action of keysDiscardActions) {
                const result = action.onClick?.();
                if (result instanceof Promise) {
                    await result;
                }
            }
        }

        return { blocked: false as const };
    }, [
        columnsDirtyCount,
        dataDirtyCount,
        dataTabActions,
        discardAll,
        draftTableNameDirty,
        keysDirtyCount,
        keysTabActions,
        triggerAction,
    ]);

    useEffect(() => {
        const unregister = registerTableInfoCloseController(tabId, {
            hasUnsavedChanges: () => dirtySummary.hasChanges,
            requestClose: () => {
                if (canHandleCloseRequest) {
                    if (!isTableTabActive && tabGroupId) {
                        setActiveGroupId(tabGroupId);
                        setActiveTabId(tabId, tabGroupId);
                    }
                    setClosePending(true);
                    return;
                }
                toast.error('This table has unsaved changes but no close actions are available.');
                setClosePending(false);
            },
        });
        return unregister;
    }, [
        canHandleCloseRequest,
        dirtySummary.hasChanges,
        isTableTabActive,
        setActiveGroupId,
        setActiveTabId,
        tabGroupId,
        tabId,
        toast,
    ]);

    useEffect(() => {
        if (!closePending) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setClosePending(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closePending]);

    useEffect(() => {
        if (closePending && !hasChanges) {
            setClosePending(false);
        }
    }, [closePending, hasChanges]);

    useTableInfoKeyboardShortcuts({
        isTableTabActive: Boolean(isTableTabActive),
        activeTab,
        hasChanges,
        saving,
        viewMode,
        isCreateMode,
        filterTabs,
        filterInputRef,
        saveColumns,
        tabReload,
    });

    const displayIds = useMemo(() => {
        let visibleRows = rows;
        if (filterCol.trim() !== '') {
            const filterText = filterCol.trim().toLowerCase();
            visibleRows = rows.filter(row => row.current.Name.toLowerCase().includes(filterText));
        }
        if (!sortDir || sortCol === 'idx') {
            return visibleRows.map(row => row.id);
        }
        return [...visibleRows]
            .sort((left, right) => {
                let leftValue = left.current[sortCol as keyof models.ColumnDef] as
                    | string
                    | boolean
                    | number;
                let rightValue = right.current[sortCol as keyof models.ColumnDef] as
                    | string
                    | boolean
                    | number;
                if (typeof leftValue === 'boolean') leftValue = leftValue ? 1 : 0;
                if (typeof rightValue === 'boolean') rightValue = rightValue ? 1 : 0;
                const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
                return sortDir === 'asc' ? comparison : -comparison;
            })
            .map(row => row.id);
    }, [filterCol, rows, sortCol, sortDir]);

    const { actionsByTab, tabs } = useTableInfoTabs({
        activeTab,
        reloading,
        viewMode,
        saving,
        isCreateMode,
        hasChanges,
        selectedRowsSize: selectedRows.size,
        dataTabActions,
        ddlTabActions,
        columnsDirtyCount,
        dataDirtyCount,
        keysDirtyCount,
        addColumn,
        toggleDeleteRows,
        discardAll,
        saveColumns,
        tabReload,
    });

    const handleSelectTableFromBreadcrumb = useCallback(
        (nextTableName: string) => {
            const normalized = nextTableName.trim();
            if (!normalized || normalized === table) return;
            const nextQualifiedName = schema ? `${schema}.${normalized}` : normalized;
            addTab(createTableTab(nextQualifiedName, pinnedConnection));
        },
        [addTab, pinnedConnection, schema, table],
    );

    if (loading) {
        return (
            <div className='flex flex-col items-center justify-center gap-4 h-full bg-background'>
                <span className='text-body text-muted-foreground font-medium'>
                    Fetching table schema...
                </span>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className='flex flex-col items-center justify-center p-12 h-full bg-background text-center'>
                <div className='w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6'>
                    <Info size={32} className='text-destructive' />
                </div>
                <h2 className='text-title text-foreground mb-2'>Failed to load table</h2>
                <p className='text-muted-foreground max-w-md mb-8'>{fetchError}</p>
                <Button
                    onClick={() => void loadInfo()}
                    variant='secondary'
                    className='rounded-md px-8'
                >
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            className='flex flex-col h-full overflow-hidden outline-none'
        >
            <TableInfoHeader
                activeTab={activeTab}
                actions={actionsByTab[activeTab]}
                createNameInputRef={createNameInputRef}
                dbName={pinnedConnection?.dbName || ''}
                draftTableName={draftTableName}
                filterCol={filterCol}
                filterInputRef={filterInputRef}
                isCreateMode={isCreateMode}
                onDraftTableNameChange={setDraftTableName}
                onDraftTableNameReset={() => setDraftTableName(target.table || 'new_table')}
                onFilterChange={value => {
                    if (activeTab === 'columns') {
                        setSortCol('idx');
                        setSortDir('asc');
                    }
                    setFilterCol(value);
                }}
                onSelectTable={handleSelectTableFromBreadcrumb}
                onTabChange={value => {
                    setActiveTab(value);
                    setFilterCol('');
                }}
                schema={schema}
                showFilter={!isCreateMode && filterTabs.has(activeTab)}
                table={table}
                tabs={tabs}
            />

            <UnsavedChangesBanner
                open={closePending}
                saving={saving}
                saveLabel='Save & Close'
                discardLabel='Discard & Close'
                onKeepEditing={() => setClosePending(false)}
                onSave={() => {
                    void saveWorkspaceChanges().then(result => {
                        if (!result.blocked && result.savedAny) {
                            setClosePending(false);
                            closeTableTab();
                        }
                    });
                }}
                onDiscard={() => {
                    void discardWorkspaceChanges().then(result => {
                        if (result?.blocked) return;
                        setClosePending(false);
                        closeTableTab();
                    });
                }}
            />

            <ConfirmDialog
                open={keysReloadConfirmOpen}
                title='Reload Keys & Constraints'
                description={`Reloading will discard ${keysDirtyCount} unsaved change${keysDirtyCount === 1 ? '' : 's'} across the keys panels.`}
                helperText='Save your changes first if you want to keep them.'
                confirmLabel='Discard & Reload'
                destructive
                onCancel={() => setKeysReloadConfirmOpen(false)}
                onConfirm={() => {
                    setKeysReloadConfirmOpen(false);
                    setInfoRefreshKey(key => key + 1);
                }}
            />

            <main className='flex-1 flex flex-col min-h-0 relative'>
                {activeTab === 'columns' && (
                    <div className='flex-1 min-h-0 overflow-hidden flex flex-col'>
                        <SchemaInfoView
                            rows={rows}
                            displayIds={displayIds}
                            types={types}
                            editCell={editCell}
                            setEditCell={setEditCell}
                            onUpdate={updateRow}
                            onDiscard={discardRow}
                            rowErrors={rowErrors}
                            selectedRows={selectedRows}
                            onRowMouseDown={handleRowMouseDown}
                            onRowMouseEnter={handleRowMouseEnter}
                            readOnlyMode={viewMode}
                            sortCol={sortCol}
                            sortDir={sortDir}
                            onSort={column => {
                                if (sortCol !== column) {
                                    setSortCol(column);
                                    setSortDir('asc');
                                } else {
                                    setSortDir(direction =>
                                        direction === 'asc'
                                            ? 'desc'
                                            : direction === 'desc'
                                              ? null
                                              : 'asc',
                                    );
                                }
                            }}
                            filterText={filterCol}
                            onFilterChange={setFilterCol}
                            filterInputRef={filterInputRef}
                        />
                    </div>
                )}

                <div
                    className={cx('flex flex-col flex-1 min-h-0', activeTab !== 'data' && 'hidden')}
                >
                    <div className='flex-1 h-full flex flex-col min-h-0 bg-background rounded-md'>
                        <ResultPanel
                            tabId={dataTabId}
                            onRun={loadData}
                            result={resolvedDataResult}
                            onActionsChange={actions => setDataTabActions(actions)}
                            onFilterRun={handleDataFilterRun}
                            baseQuery={dataTabCanonicalBaseQuery}
                            preferBaseQueryForFilter
                            isReadOnlyTab={viewMode}
                            showMaximizeControl={false}
                            filterColumns={dataFallbackColumns}
                            filterTableName={table}
                            dataSchema={schema}
                            dataConnectionKey={dataConnectionKey}
                            // Pass the store's own object directly — it's
                            // structurally identical to PinnedResultConnection
                            // and stable for the tab's whole life (ADR-0001).
                            // Rebuilding a new object literal here on every
                            // render broke reference equality for every
                            // downstream useCallback/useMemo keyed on it
                            // (useResultPanelSaveFlow, ResultPanelContent),
                            // forcing the result grid to re-render on every
                            // TableInfo render — the root cause of the
                            // app-wide click lag reported after ADR-0001.
                            pinnedConnection={pinnedConnection}
                        />
                    </div>
                </div>

                <div
                    className={cx(
                        'flex-1 h-full relative flex flex-col min-h-0',
                        activeTab !== 'erd' && 'hidden',
                    )}
                >
                    <RelationshipView
                        schema={schema}
                        table={table}
                        refreshKey={erdRefreshKey}
                        onCountChange={handleErdCountChange}
                        isActive={activeTab === 'erd'}
                    />
                </div>

                {activeTab === 'keys' && (
                    <div className='flex flex-1 min-h-0 flex-col overflow-hidden'>
                        <KeysView
                            connectionID={pinnedConnection?.connectionID || ''}
                            dbName={pinnedConnection?.dbName || ''}
                            environmentKey={pinnedConnection?.environmentKey || ''}
                            schema={schema}
                            tableName={table}
                            refreshKey={infoRefreshKey}
                            readOnlyMode={viewMode}
                            isActive
                            tableColumns={rows.map(row => row.current.Name)}
                            onDirtyCountChange={setKeysDirtyCount}
                            onActionsChange={setKeysTabActions}
                            driver={driver}
                            activeTab={keysActiveTab}
                            onActiveTabChange={setKeysActiveTab}
                        />
                    </div>
                )}

                {activeTab === 'ddl' && (
                    <div className='flex-1 min-h-0 overflow-hidden flex flex-col'>
                        <DDLInfoView
                            connectionID={pinnedConnection?.connectionID || ''}
                            dbName={pinnedConnection?.dbName || ''}
                            schema={schema}
                            tableName={table}
                            refreshKey={infoRefreshKey}
                            onActionsChange={setDdlTabActions}
                        />
                    </div>
                )}
            </main>

            <ConfirmActionDialog
                open={showDeleteConfirm}
                title='Confirm Destruction'
                description='Are you sure?'
                detail={`You are about to permanently delete ${rows.filter(row => row.deleted).length} ${rows.filter(row => row.deleted).length === 1 ? 'column' : 'columns'}. This action cannot be undone.`}
                confirmLabel='Delete Permanently'
                confirmVariant='destructive'
                onCancel={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    void confirmSafetyAndSave().then(result => {
                        if (result?.exitCreateMode) {
                            setIsCreateMode(false);
                        }
                        if (result?.rowErrors) {
                            setRowErrors(result.rowErrors);
                            return;
                        }
                        if (closePending && result?.didSave) {
                            setClosePending(false);
                            closeTableTab();
                        }
                    });
                }}
            />
            {writeSafetyGuard.modals}
        </div>
    );
};

// Memoized: `tabId`/`tableName` are the only props and are stable for a
// given tab's whole lifetime, so this only needs to re-render for its own
// state/store subscriptions, not whenever an unrelated tab or group
// re-renders its parent — see QueryGroup.tsx and tabSlice.ts for the other
// half of this fix (stable `group` props + narrow store selectors upstream).
export const TableInfo = React.memo(TableInfoComponent);
