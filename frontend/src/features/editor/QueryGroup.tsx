// SPDX-License-Identifier: GPL-3.0-only

import React, { useRef, useEffect, useCallback } from 'react';
import { useEditorStore, TabGroup } from '../../stores/editorStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useResultStore } from '../../stores/resultStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { TabBar } from './TabBar';
import { MonacoEditorWrapper } from './MonacoEditor';
import { TableInfo } from './TableInfo';
import { CatalogInfoView } from './CatalogInfoView';
import { GitDiffView } from './GitDiffView';
import { SchemaDiffTab } from './SchemaDiffTab';
import { saveQueryTabById } from './scriptAutosave';
import { SettingsView } from '../../components/layout/SettingsView';
import { ShortcutsView } from '../../components/layout/ShortcutsView';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '../../lib/cn';
import { getErrorMessage } from '../../lib/errors';
import { DOM_EVENT, TAB_TYPE } from '../../lib/constants';
import { onCommand } from '../../lib/commandBus';
import { applyPreExecuteFilterPolicy, resolveExecuteQuery } from '../../lib/queryExecutionRouting';
import { useToast } from '../../components/layout/Toast';
import { useWriteSafetyGuard } from '../../lib/writeSafety/useWriteSafetyGuard';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { isDuplicateScriptNameError } from '../../stores/scriptStore';
import { requestTableInfoClose } from './TableInfo/tableInfoCloseRegistry';
import {
    guardTabResultLeave,
    RESULT_LEAVE_UNAVAILABLE_MESSAGE,
} from './resultPanel/guardTabResultLeave';
import { keepUnsavedResult } from './resultPanel/keepUnsavedResult';

interface QueryGroupProps {
    group: TabGroup;
    isActiveGroup: boolean;
}

const QueryGroupComponent: React.FC<QueryGroupProps> = ({ group, isActiveGroup }) => {
    const { id: groupId, tabs, activeTabId } = group;

    // Lazy-mount: only render a tab's content after it has been active at least once.
    // This prevents N Monaco instances from being created upfront (each costs ~50-100 MB).
    const mountedTabsRef = useRef<Set<string>>(new Set());
    if (activeTabId) mountedTabsRef.current.add(activeTabId);
    // Evict closed tabs so their IDs don't linger in the set.
    const tabIdSet = new Set(tabs.map(t => t.id));
    for (const id of mountedTabsRef.current) {
        if (!tabIdSet.has(id)) mountedTabsRef.current.delete(id);
    }
    // Individual selectors, not a whole-store `useEditorStore()` call: action
    // functions are stable references for the store's lifetime, so selecting
    // each one narrowly means this component only re-renders for state it
    // actually reads (via the `group` prop and the selectors below) instead
    // of on every single editorStore update anywhere in the app.
    const removeTab = useEditorStore(state => state.removeTab);
    const setActiveTabId = useEditorStore(state => state.setActiveTabId);
    const setActiveGroupId = useEditorStore(state => state.setActiveGroupId);
    const renameTab = useEditorStore(state => state.renameTab);
    const updateTabQuery = useEditorStore(state => state.updateTabQuery);
    const updateTabContext = useEditorStore(state => state.updateTabContext);
    const addTab = useEditorStore(state => state.addTab);
    const splitGroup = useEditorStore(state => state.splitGroup);
    const isConnected = useConnectionStore(state => state.isConnected);
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const activeProject = useProjectStore(state => state.activeProject);
    const { toast } = useToast();
    const writeSafety = useWriteSafetyGuard(activeEnvironmentKey, {
        onOpenPreview: async ({ sql, auditMeta }) => {
            if (!activeTab?.id) return false;
            const openWritePreview = getApiGateway().query.openWritePreview;
            if (!openWritePreview) {
                toast.error('Write preview is unavailable in this build.');
                return false;
            }

            try {
                if (activeTab.context?.isWritePreview && activeTab.context.writePreviewSessionId) {
                    const closeWritePreview = getApiGateway().query.closeWritePreview;
                    await closeWritePreview?.(activeTab.context.writePreviewSessionId);
                }

                const previewResult = unwrapOrThrow(
                    await openWritePreview(sql, activeEnvironmentKey || ''),
                );
                if (!previewResult?.previewSessionId) {
                    toast.error('Could not open write preview.');
                    return false;
                }

                updateTabContext(activeTab.id, {
                    isWritePreview: true,
                    writePreviewSessionId: previewResult.previewSessionId,
                    writePreviewOriginalSql: sql,
                    writePreviewSourceTabId: undefined,
                    writePreviewEnvironmentKey: activeEnvironmentKey || undefined,
                    writePreviewRiskLevel: auditMeta?.riskLevel,
                    writePreviewPreviewRowCount: auditMeta?.previewRowCount,
                    writePreviewUsedProtectionLayers: auditMeta?.usedProtectionLayers,
                });

                const resultStore = useResultStore.getState();
                resultStore.initTab(activeTab.id);
                resultStore.appendRows(
                    activeTab.id,
                    previewResult.initialResultMeta.columns,
                    previewResult.initialResultMeta.rows,
                    previewResult.initialResultMeta.tableName,
                    [],
                );
                resultStore.touchProgress(
                    activeTab.id,
                    previewResult.initialResultMeta.rows.length,
                );
                if (previewResult.initialResultMeta.rows.length > 0) {
                    resultStore.markFirstRow(activeTab.id);
                }
                resultStore.setTotalCount(activeTab.id, previewResult.initialResultMeta.totalCount);
                resultStore.setLastExecutedQuery(activeTab.id, sql);
                resultStore.setDone(
                    activeTab.id,
                    previewResult.initialResultMeta.rows.length,
                    0,
                    true,
                    previewResult.initialResultMeta.hasMore,
                );
                toast.success('Write preview opened in the current tab.');
                return true;
            } catch (error) {
                toast.error(`Could not open write preview: ${getErrorMessage(error)}`);
                return false;
            }
        },
    });
    const activeTab = tabs.find(t => t.id === activeTabId);
    const findTabById = useCallback((tabId: string) => tabs.find(t => t.id === tabId), [tabs]);

    const saveSourceControlTab = useCallback(
        async (tabId: string): Promise<boolean> => {
            const tab = findTabById(tabId);
            if (!tab || tab.type !== TAB_TYPE.QUERY) return false;
            if (tab.context?.sourceControlFile !== 'gitignore') return false;
            unwrapOrThrow(await getApiGateway().sourceControl.writeGitIgnore(tab.query || ''));
            toast.success('Saved .gitignore');
            return true;
        },
        [findTabById, toast],
    );

    // Edge drop zones for splitting
    const {
        setNodeRef: setLeftNodeRef,
        isOver: isLeftOver,
        active: dragActive,
    } = useDroppable({
        id: `split-left-${groupId}`,
        data: { type: 'SplitLeft', groupId },
    });
    const { setNodeRef: setRightNodeRef, isOver: isRightOver } = useDroppable({
        id: `split-right-${groupId}`,
        data: { type: 'SplitRight', groupId },
    });

    const isDraggingTab = dragActive?.data.current?.type === 'Tab';

    useEffect(() => {
        if (!activeProject?.id || !activeProfile?.name) return;
        for (const tab of tabs) {
            if (tab.type !== TAB_TYPE.QUERY) continue;
            if (
                tab.context?.scriptProjectId === activeProject.id &&
                tab.context?.scriptConnectionName === activeProfile.name
            ) {
                continue;
            }
            updateTabContext(tab.id, {
                scriptProjectId: activeProject.id,
                scriptConnectionName: activeProfile.name,
            });
        }
    }, [activeProfile?.name, activeProject?.id, tabs, updateTabContext]);

    const closeTabNow = useCallback(
        async (id: string) => {
            const tab = tabs.find(t => t.id === id);
            try {
                if (tab?.context?.isWritePreview && tab.context.writePreviewSessionId) {
                    await getApiGateway().query.closeWritePreview?.(
                        tab.context.writePreviewSessionId,
                    );
                    useResultStore.getState().clearResult(tab.id);
                } else if (tab?.type === TAB_TYPE.QUERY) {
                    try {
                        const savedBySourceControl = await saveSourceControlTab(tab.id);
                        if (!savedBySourceControl) {
                            await saveQueryTabById(tab.id);
                        }
                    } catch (error) {
                        console.error('Auto save failed before close', error);
                    }
                }
            } finally {
                removeTab(id, groupId);
            }
        },
        [groupId, removeTab, saveSourceControlTab, tabs],
    );

    const handleClose = useCallback(
        async (id: string) => {
            const tab = tabs.find(t => t.id === id);
            if (tab?.type === 'table') {
                const closeResult = requestTableInfoClose(id);
                // 'missing' means no dirty-tracking controller is registered
                // for this tab (nothing marks it as having unsaved changes) —
                // only a real 'blocked' (an active controller reporting
                // unsaved changes) should stop the close.
                if (closeResult === 'blocked') {
                    return;
                }
                await closeTabNow(id);
                return;
            }

            // Every other tab keeps its edits in the result panel; with unsaved
            // ones the panel asks first and closes only once the user answers.
            let closing: Promise<void> | undefined;
            guardTabResultLeave(
                id,
                'close',
                () => {
                    closing = closeTabNow(id);
                },
                () => toast.error(RESULT_LEAVE_UNAVAILABLE_MESSAGE),
            );
            await closing;
        },
        [closeTabNow, tabs, toast],
    );

    useEffect(() => {
        const off = onCommand(DOM_EVENT.SAVE_TAB_ACTION, detail => {
            if (!detail) return;
            void (async () => {
                try {
                    const savedBySourceControl = await saveSourceControlTab(detail);
                    if (!savedBySourceControl) {
                        await saveQueryTabById(detail);
                    }
                } catch (error) {
                    if (isDuplicateScriptNameError(error)) {
                        toast.error('Tên script đã tồn tại. Vui lòng đặt tên khác.');
                        return;
                    }
                    toast.error(`Failed to save script: ${getErrorMessage(error)}`);
                }
            })();
        });
        return off;
    }, [saveSourceControlTab, toast]);

    const executeQueryNow = useCallback(
        async (queryToRun: string) => {
            if (!activeTab || !isConnected) return;

            if (activeTab.context?.isWritePreview && activeTab.context.writePreviewSessionId) {
                await getApiGateway().query.closeWritePreview?.(
                    activeTab.context.writePreviewSessionId,
                );
                updateTabContext(activeTab.id, {
                    isWritePreview: undefined,
                    writePreviewSessionId: undefined,
                    writePreviewOriginalSql: undefined,
                    writePreviewSourceTabId: undefined,
                    writePreviewEnvironmentKey: undefined,
                    writePreviewRiskLevel: undefined,
                    writePreviewPreviewRowCount: undefined,
                    writePreviewUsedProtectionLayers: undefined,
                });
            }

            // A result with unsaved edits is set aside under its own key rather
            // than replaced: the new run takes the main slot, and both stay open.
            await keepUnsavedResult(activeTab.id);

            const resultStore = useResultStore.getState();
            applyPreExecuteFilterPolicy({
                source: 'editor',
                sourceTabId: activeTab.id,
                resultTabIds: Object.keys(resultStore.results),
                clearResultFilterExpr: tabId => resultStore.setFilterExpr(tabId, ''),
                clearResultOrderByExpr: tabId => resultStore.setOrderByExpr(tabId, ''),
                updateTabContext,
            });

            const result = await getApiGateway().query.execute(
                activeTab.id,
                resolveExecuteQuery({
                    source: 'editor',
                    editorQuery: queryToRun,
                }),
            );
            if (!result.ok) {
                console.error('ExecuteQuery error:', result.error.message);
                toast.error(`Failed to run query: ${result.error.message}`);
            }
        },
        [activeTab, isConnected, updateTabContext, toast],
    );

    const runQuery = useCallback(
        async (queryToRun: string) => {
            const guardResult = await writeSafety.guardSql(queryToRun, 'Execute');
            if (!guardResult.allowed) {
                if (guardResult.blockedReason) {
                    toast.error(guardResult.blockedReason);
                }
                return;
            }

            const setPendingQueryAuditMeta = getApiGateway().query.setPendingQueryAuditMeta;
            if (activeTab?.id && guardResult.auditMeta && setPendingQueryAuditMeta) {
                await setPendingQueryAuditMeta(activeTab.id, {
                    reason: guardResult.auditMeta.reason,
                    riskLevel: guardResult.auditMeta.riskLevel,
                    previewRowCount: guardResult.auditMeta.previewRowCount,
                    usedProtectionLayers: guardResult.auditMeta.usedProtectionLayers,
                    snapshotRef: guardResult.auditMeta.snapshotRef,
                });
            }

            if (activeTab?.id) {
                useResultStore
                    .getState()
                    .setTransactionWrap(activeTab.id, Boolean(guardResult.sqlOverride));
            }
            await executeQueryNow(guardResult.sqlOverride || queryToRun);
        },
        [activeTab?.id, executeQueryNow, toast, writeSafety],
    );

    // Running never asks about unsaved result edits: `executeQueryNow` sets an
    // edited result aside under its own key before the new one takes its slot.
    const handleRun = useCallback(
        async (queryToRun: string) => {
            await runQuery(queryToRun);
        },
        [runQuery],
    );

    const handleExplain = useCallback(
        async (queryToExplain: string, analyze: boolean) => {
            if (!activeTab || !isConnected) return;

            const explainTabId = `${activeTab.id}::explain:${analyze ? 'analyze' : 'plan'}`;
            const result = await getApiGateway().query.explain(
                explainTabId,
                queryToExplain,
                analyze,
            );
            if (!result.ok) {
                console.error('ExplainQuery error:', result.error.message);
                toast.error(`Failed to explain query: ${result.error.message}`);
            }
        },
        [activeTab, isConnected, toast],
    );

    const handleCancel = useCallback(async () => {
        if (!activeTabId) return;
        await getApiGateway().query.cancel(activeTabId);
    }, [activeTabId]);

    const handleSplit = useCallback(
        (tabId: string) => {
            splitGroup(groupId, tabId);
        },
        [groupId, splitGroup],
    );

    const handleRenameTab = useCallback(
        (tabId: string, newName: string) => {
            const currentTab = tabs.find(tab => tab.id === tabId);
            if (!currentTab || currentTab.type !== TAB_TYPE.QUERY) {
                renameTab(tabId, newName);
                return;
            }
            const oldName = currentTab.name;
            renameTab(tabId, newName);
            if (!activeProfile?.name) return;
            void useBookmarkStore
                .getState()
                .remapTabBookmarks(activeProfile.name, tabId, oldName, newName);
        },
        [activeProfile?.name, renameTab, tabs],
    );

    const handleGroupClick = useCallback(() => {
        if (!isActiveGroup) {
            setActiveGroupId(groupId);
        }
    }, [isActiveGroup, setActiveGroupId, groupId]);

    return (
        <div
            className={cn('flex flex-col h-full w-full', isActiveGroup && 'active-group')}
            onClickCapture={handleGroupClick}
        >
            <TabBar
                groupId={groupId}
                tabs={tabs}
                activeTabId={activeTabId}
                onActivate={tabId => setActiveTabId(tabId, groupId)}
                onClose={handleClose}
                onNewTab={() => addTab(undefined, groupId)}
                onRename={handleRenameTab}
                onSplit={handleSplit}
            />

            <div
                className={cn(
                    'flex-1 relative flex flex-col overflow-hidden bg-card px-1',
                    isActiveGroup && 'active-group-body',
                )}
            >
                {isDraggingTab && (
                    <>
                        <div
                            ref={setLeftNodeRef}
                            className='absolute top-0 bottom-0 left-0 z-popover w-1/4'
                        />
                        <div
                            ref={setRightNodeRef}
                            className='absolute top-0 bottom-0 right-0 z-popover w-1/4'
                        />
                        <div
                            className={cn('split-snap-preview left', isLeftOver && 'is-visible')}
                        />
                        <div
                            className={cn('split-snap-preview right', isRightOver && 'is-visible')}
                        />
                    </>
                )}

                {tabs.length === 0 ? (
                    <div className='p-5 text-center text-muted-foreground'>
                        No open tabs in this group.
                    </div>
                ) : (
                    <div className='flex-1 overflow-hidden' style={{ height: '100%' }}>
                        {tabs.map(tab => {
                            const isActive = tab.id === activeTabId;
                            const isMounted = mountedTabsRef.current.has(tab.id);
                            if (!isMounted) return null;
                            return (
                                <div
                                    key={tab.id}
                                    className={cn('h-full flex-col', isActive ? 'flex' : 'hidden')}
                                >
                                    {tab.type === 'table' ? (
                                        <TableInfo tabId={tab.id} tableName={tab.content || ''} />
                                    ) : tab.type === TAB_TYPE.CATALOG ? (
                                        <CatalogInfoView tabId={tab.id} catalog={tab.catalog!} />
                                    ) : tab.type === TAB_TYPE.COMPARE ? (
                                        <SchemaDiffTab tabId={tab.id} />
                                    ) : tab.type === 'settings' ? (
                                        <SettingsView tabId={tab.id} />
                                    ) : tab.type === 'shortcuts' ? (
                                        <ShortcutsView />
                                    ) : tab.type === 'git_diff' ? (
                                        <GitDiffView tab={tab} />
                                    ) : (
                                        <>
                                            <MonacoEditorWrapper
                                                tabId={tab.id}
                                                value={tab.query}
                                                onChange={v => updateTabQuery(tab.id, v)}
                                                onRun={handleRun}
                                                onExplain={handleExplain}
                                                isActive={isActiveGroup && isActive}
                                                onFocus={() => setActiveTabId(tab.id, groupId)}
                                                readOnly={tab.readOnly}
                                                previewedSql={
                                                    tab.context?.isWritePreview
                                                        ? tab.context.writePreviewOriginalSql
                                                        : undefined
                                                }
                                            />
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {writeSafety.modals}
        </div>
    );
};

// Memoized so an unrelated group's re-render (e.g. from a sibling group's
// own store subscriptions, or QueryTabs re-computing its own state) doesn't
// cascade into this one when its `group`/`isActiveGroup` props are
// unchanged — see the tabSlice.ts comment for why `group` now stays
// referentially stable across actions that don't touch it.
export const QueryGroup = React.memo(QueryGroupComponent);
