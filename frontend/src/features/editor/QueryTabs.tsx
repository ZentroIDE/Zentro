// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useState } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';

import { DOM_EVENT, TAB_TYPE } from '../../lib/constants';
import { onCommand } from '../../lib/commandBus';
import { splitLastQuery } from '../../lib/queryBuilder';
import { getDataDirtyCount } from '../../lib/pendingChanges';
import { isKeptResultKey, resultKeysForTab, sortResultKeys } from '../../lib/resultKeys';
import { saveQueryTabById, useTabCycling, useTabExecution } from '../../features/editor';
import { useToast } from '../../components/layout/Toast';
import { useConnectionStore } from '../../stores/connectionStore';
import { Tab, useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useResultStore } from '../../stores/resultStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { QueryTabsEmptyState } from './QueryTabsEmptyState';
import { QueryGroup } from './QueryGroup';
import { ResultPanel } from './ResultPanel';
import type { TransactionSummary } from './resultPanel/types';
import { ResultPanelLogPane } from './resultPanel/ResultPanelLogPane';
import { ServerMessagesPanel } from './resultPanel/ServerMessagesPanel';
import { ExecutionSummaryPanel } from './resultPanel/ExecutionSummaryPanel';
import { ResultBottomPanelTabBar } from './resultPanel/ResultBottomPanelTabBar';
import { useBottomPanels } from './resultPanel/bottomPanelRegistry';
import { registerBuiltInBottomPanels } from './resultPanel/bottomPanels';
import { TabSwitcherOverlay } from './queryTabs/TabSwitcherOverlay';
import { useQueryTabsDnD } from './queryTabs/useQueryTabsDnD';
import { requestTableInfoClose } from './TableInfo/tableInfoCloseRegistry';
import {
    guardTabResultLeave,
    RESULT_LEAVE_UNAVAILABLE_MESSAGE,
} from './resultPanel/guardTabResultLeave';
import { guardResultLeave } from './resultPanel/resultUnsavedGate';

const EXPLAIN_TAB_KEYS = [
    {
        id: 'explain-plan' as const,
        label: 'Explain Plan',
        resultSuffix: 'plan' as const,
    },
    {
        id: 'explain-analyze' as const,
        label: 'Explain Analyze',
        resultSuffix: 'analyze' as const,
    },
] as const;

export const QueryTabs: React.FC = () => {
    // Individual selectors, not a whole-store `useEditorStore()` call — see
    // QueryGroup.tsx for why. `groups`/`activeGroupId` still need to be
    // reactive (this component derives the active tab/result from them), but
    // the action functions below are stable references and shouldn't force a
    // re-render on their own.
    const groups = useEditorStore(state => state.groups);
    const activeGroupId = useEditorStore(state => state.activeGroupId);
    const addTab = useEditorStore(state => state.addTab);
    const removeTab = useEditorStore(state => state.removeTab);
    const closeGroup = useEditorStore(state => state.closeGroup);
    const moveTab = useEditorStore(state => state.moveTab);
    const setActiveGroupId = useEditorStore(state => state.setActiveGroupId);
    const setActiveTabId = useEditorStore(state => state.setActiveTabId);
    const splitGroupFromDrag = useEditorStore(state => state.splitGroupFromDrag);
    const results = useResultStore(state => state.results);
    const transactionWrapTabs = useResultStore(state => state.transactionWrapTabs);
    const transactionTotals = useResultStore(state => state.transactionTotals);
    const clearResult = useResultStore(state => state.clearResult);
    const messagesByTab = useResultStore(state => state.messagesByTab);
    const clearMessages = useResultStore(state => state.clearMessages);
    const isConnected = useConnectionStore(state => state.isConnected);
    const { toast } = useToast();
    const viewMode = useSettingsStore(state => state.viewMode);
    const showResultPanel = useLayoutStore(state => state.showResultPanel);
    const bottomPanelView = useLayoutStore(state => state.bottomPanelView);
    const setBottomPanelView = useLayoutStore(state => state.setBottomPanelView);
    const activeBottomPanelId = useLayoutStore(state => state.activeBottomPanelId);
    const setActiveBottomPanelId = useLayoutStore(state => state.setActiveBottomPanelId);
    const bottomPanels = useBottomPanels();

    const globalActiveGroup = groups.find(group => group.id === activeGroupId);
    const globalActiveTabId = globalActiveGroup?.activeTabId;
    const globalActiveTab = globalActiveGroup?.tabs.find(tab => tab.id === globalActiveTabId);
    const globalActiveResult = globalActiveTabId ? results[globalActiveTabId] : undefined;
    // Query results only ever exist for query tabs — a table/catalog/compare
    // tab has no result to fall back to, even though the bottom panel itself
    // (Audit/Output/App Log/Query Stats/extensions) stays available regardless.
    const isQueryTabActive = (globalActiveTab?.type || TAB_TYPE.QUERY) === TAB_TYPE.QUERY;

    const {
        handleRunGlobal,
        handleFilterRunGlobal,
        handleAppendToQuery,
        handleOpenFilterInNewTab,
    } = useTabExecution({ lastExecutedQuery: globalActiveResult?.lastExecutedQuery });

    const [activeSubTabId, setActiveSubTabId] = useState<string | null>(null);
    const [isResultMaximized, setIsResultMaximized] = useState(false);

    const isResultPanelVisible = showResultPanel;

    const allTabs = useMemo(
        () => groups.flatMap(group => group.tabs.map(tab => ({ tab, groupId: group.id }))),
        [groups],
    );
    const tabMetaById = useMemo(() => new Map(allTabs.map(item => [item.tab.id, item])), [allTabs]);

    const activateTabById = React.useCallback(
        (tabId: string) => {
            const meta = tabMetaById.get(tabId);
            if (!meta) return;
            setActiveGroupId(meta.groupId);
            setActiveTabId(tabId, meta.groupId);
        },
        [setActiveGroupId, setActiveTabId, tabMetaById],
    );

    const closeActiveTabWithSave = React.useCallback(async () => {
        const editorState = useEditorStore.getState();
        const groupId = editorState.activeGroupId;
        const activeGroup = editorState.groups.find(group => group.id === groupId);
        const activeTabId = activeGroup?.activeTabId;
        const activeTab = activeGroup?.tabs.find(tab => tab.id === activeTabId);
        if (!groupId || !activeTabId || !activeTab) return;

        if (activeTab.type === 'table') {
            const closeResult = requestTableInfoClose(activeTabId);
            if (closeResult === 'blocked' || closeResult === 'missing') {
                return;
            }
            removeTab(activeTabId, groupId);
            return;
        }

        const closeNow = async () => {
            if (activeTab.type === TAB_TYPE.QUERY && activeTab.query?.trim()) {
                try {
                    await saveQueryTabById(activeTabId);
                } catch (error) {
                    console.error('Shortcut close autosave failed', error);
                }
            }

            removeTab(activeTabId, groupId);
        };

        // With unsaved edits in the result grid the panel asks first, and
        // closes only once the user answers.
        let closing: Promise<void> | undefined;
        guardTabResultLeave(
            activeTabId,
            'close',
            () => {
                closing = closeNow();
            },
            () => toast.error(RESULT_LEAVE_UNAVAILABLE_MESSAGE),
        );
        await closing;
    }, [removeTab, toast]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.CLOSE_ACTIVE_TAB, () => {
            void closeActiveTabWithSave();
        });
        return off;
    }, [closeActiveTabWithSave]);

    const { tabSwitcher, selectTab } = useTabCycling({
        activeTabId: globalActiveTabId ?? undefined,
        tabsById: tabMetaById,
        onActivateTab: activateTabById,
    });

    useEffect(() => {
        if (!isResultPanelVisible) {
            setIsResultMaximized(false);
        }
    }, [isResultPanelVisible]);

    useEffect(() => {
        groups.forEach(group => {
            if (group.tabs.length === 0 && groups.length > 1) {
                closeGroup(group.id);
            }
        });
    }, [groups, closeGroup]);

    useEffect(() => {
        setActiveSubTabId(null);
    }, [globalActiveTabId]);

    // Every result of the active tab: its main result, the extra statements of a
    // script, and results set aside beside the current one for their unsaved edits.
    const allActiveResultKeys = useMemo(
        () =>
            globalActiveTabId
                ? sortResultKeys(
                      globalActiveTabId,
                      resultKeysForTab(globalActiveTabId, Object.keys(results)),
                  )
                : [],
        [globalActiveTabId, results],
    );
    // The run's own results: what summaries and transaction totals are about.
    const globalActiveResultKeys = useMemo(
        () => allActiveResultKeys.filter(key => !isKeptResultKey(key)),
        [allActiveResultKeys],
    );
    const keptResultKeys = useMemo(
        () => allActiveResultKeys.filter(isKeptResultKey),
        [allActiveResultKeys],
    );

    const isTransactionWrap = Boolean(globalActiveTabId && transactionWrapTabs[globalActiveTabId]);

    const transactionSummary = useMemo((): TransactionSummary | undefined => {
        if (!isTransactionWrap || globalActiveResultKeys.length === 0) return undefined;
        const statements = globalActiveResultKeys.map(key => {
            const r = results[key];
            return {
                tabResultKey: key,
                statementText: r?.lastExecutedQuery ?? '',
                affected: r?.affected ?? 0,
                duration: r?.duration ?? 0,
                isSelect: r?.isSelect ?? false,
                error: r?.error,
                isDone: r?.isDone ?? false,
            };
        });
        const totalDuration = statements.reduce((sum, s) => sum + s.duration, 0);
        return {
            statements,
            totalDuration,
            isComplete: statements.every(s => s.isDone),
            hasError: statements.some(s => Boolean(s.error)),
            aggregateTotals: globalActiveTabId ? transactionTotals[globalActiveTabId] : undefined,
        };
    }, [isTransactionWrap, globalActiveResultKeys, results, transactionTotals, globalActiveTabId]);

    // A multi-statement run made only of non-SELECT statements gets one
    // Summary tab instead of a Result tab per statement — the backend's
    // progress throttle only creates results for a few of them anyway. Any
    // SELECT in the run keeps its own Result tabs.
    const runTotals = globalActiveTabId ? transactionTotals[globalActiveTabId] : undefined;
    const summaryTabId = globalActiveTabId ? `${globalActiveTabId}::summary` : null;
    const isSummaryMode =
        !isTransactionWrap &&
        (runTotals?.statementCount ?? 0) > 1 &&
        globalActiveResultKeys.length > 0 &&
        globalActiveResultKeys.every(key => {
            const r = results[key];
            return r?.isDone && !r.isSelect;
        });

    // Server messages (PRINT/RAISERROR) for the whole run live in one
    // pseudo result tab rather than one per statement.
    const serverMessages = globalActiveTabId ? (messagesByTab[globalActiveTabId] ?? []) : [];
    const messagesTabId = globalActiveTabId ? `${globalActiveTabId}::messages` : null;
    const hasServerMessages = serverMessages.length > 0;

    // Reveal the Messages tab when a run's first message arrives — not merely
    // because the tab being switched to already has messages from an earlier run.
    const prevMessagesRef = React.useRef<{ tabId: string | null; had: boolean }>({
        tabId: null,
        had: false,
    });
    useEffect(() => {
        const prev = prevMessagesRef.current;
        if (messagesTabId && prev.tabId === globalActiveTabId && !prev.had && hasServerMessages) {
            setActiveSubTabId(messagesTabId);
        }
        prevMessagesRef.current = { tabId: globalActiveTabId ?? null, had: hasServerMessages };
    }, [globalActiveTabId, hasServerMessages, messagesTabId]);

    const currentResultTabId =
        activeSubTabId && keptResultKeys.includes(activeSubTabId)
            ? activeSubTabId
            : hasServerMessages && messagesTabId && activeSubTabId === messagesTabId
              ? messagesTabId
              : isSummaryMode && summaryTabId
                ? summaryTabId
                : activeSubTabId && globalActiveResultKeys.includes(activeSubTabId)
                  ? activeSubTabId
                  : globalActiveResultKeys.length > 0
                    ? globalActiveResultKeys[0]
                    : isQueryTabActive
                      ? globalActiveTabId
                      : null;
    const isMessagesTab = currentResultTabId !== null && currentResultTabId === messagesTabId;
    const isSummaryTab =
        isSummaryMode && currentResultTabId !== null && currentResultTabId === summaryTabId;

    const currentResult = currentResultTabId ? results[currentResultTabId] : undefined;
    const isMainResult = currentResultTabId === globalActiveTabId;
    // A kept result is a snapshot set aside for its unsaved edits: editable and
    // saveable like the main result, but not re-runnable, since a run always
    // lands in the main slot.
    const isKeptResult = currentResultTabId ? isKeptResultKey(currentResultTabId) : false;
    const isReadOnlySubTab = !isMainResult && !isKeptResult;
    const generatedKind = isMainResult || isKeptResult ? undefined : 'result';
    // Bumped when a result's slot was handed over to a kept copy, so the panel
    // in front drops the edits it still holds in its own state.
    const currentResultEpoch = useResultStore(state =>
        currentResultTabId ? (state.resultEpochs[currentResultTabId] ?? 0) : 0,
    );
    const handleReloadCurrentResult = React.useCallback(() => {
        const queryToReload = currentResult?.lastExecutedQuery?.trim() || undefined;
        void handleRunGlobal(queryToReload, currentResultTabId || undefined);
    }, [currentResult?.lastExecutedQuery, currentResultTabId, handleRunGlobal]);

    const getResultSubTabLabel = React.useCallback(
        (subTabId: string) => {
            const subResult = results[subTabId];
            if (subResult?.statementLabel?.trim()) return subResult.statementLabel.trim();

            if (subTabId === globalActiveTabId) {
                const mainQuery =
                    splitLastQuery(globalActiveTab?.query || '').base.trim() ||
                    globalActiveTab?.query ||
                    '';
                const preview = mainQuery
                    .replace(/\s+/g, ' ')
                    .replace(/;+\s*$/, '')
                    .trim();
                if (!preview) return '#1 Statement';
                return `#1 ${preview.length > 56 ? `${preview.slice(0, 56).trimEnd()}...` : preview}`;
            }

            const match = subTabId.match(/::result:(\d+)/);
            const ordinal = match ? parseInt(match[1], 10) + 1 : 1;
            return `#${ordinal} Statement`;
        },
        [globalActiveTab?.query, globalActiveTabId, results],
    );

    const resultTabs = useMemo(() => {
        const runKeys = isTransactionWrap
            ? globalActiveResultKeys.filter(k => k === globalActiveTabId)
            : globalActiveResultKeys;
        const keys = [...(isSummaryMode ? [] : runKeys), ...keptResultKeys];
        const tabs = keys.map((subTabId, index) => {
            const result = results[subTabId];
            return {
                id: subTabId,
                label: `Result ${index + 1}`,
                title: result?.lastExecutedQuery || getResultSubTabLabel(subTabId),
                running: result?.executionState === 'running',
                unsaved: getDataDirtyCount(result) > 0,
            };
        });
        if (isSummaryMode && summaryTabId) {
            tabs.push({
                id: summaryTabId,
                label: 'Summary',
                title: 'Execution summary',
                running: false,
                unsaved: false,
            });
        }
        if (hasServerMessages && messagesTabId) {
            tabs.push({
                id: messagesTabId,
                label: 'Messages',
                title: 'Server messages',
                running: false,
                unsaved: false,
            });
        }
        return tabs;
    }, [
        getResultSubTabLabel,
        globalActiveResultKeys,
        keptResultKeys,
        globalActiveTabId,
        hasServerMessages,
        isSummaryMode,
        isTransactionWrap,
        messagesTabId,
        results,
        summaryTabId,
    ]);

    const handleCloseResultTab = React.useCallback(
        (tabId: string) => {
            const tabIndex = resultTabs.findIndex(item => item.id === tabId);
            if (tabIndex === -1) return;

            const closeNow = () => {
                const isClosingActive =
                    bottomPanelView === 'result' && currentResultTabId === tabId;
                if (isClosingActive) {
                    const fallbackTab =
                        resultTabs[tabIndex + 1] ?? resultTabs[tabIndex - 1] ?? null;
                    setActiveSubTabId(fallbackTab?.id ?? null);
                }

                if (tabId === messagesTabId) {
                    if (globalActiveTabId) clearMessages(globalActiveTabId);
                    return;
                }
                if (tabId === summaryTabId) {
                    globalActiveResultKeys.forEach(key => clearResult(key));
                    return;
                }
                clearResult(tabId);
            };

            // Closing throws the result away, edits included, so a result with
            // unsaved ones asks first; its panel is brought up if it isn't showing.
            guardResultLeave(tabId, 'close', closeNow, {
                isDirty: () => getDataDirtyCount(useResultStore.getState().results[tabId]) > 0,
                reveal: () => {
                    setActiveSubTabId(tabId);
                    setBottomPanelView('result');
                },
                onUnavailable: () => toast.error(RESULT_LEAVE_UNAVAILABLE_MESSAGE),
            });
        },
        [
            bottomPanelView,
            clearMessages,
            clearResult,
            currentResultTabId,
            globalActiveResultKeys,
            globalActiveTabId,
            messagesTabId,
            resultTabs,
            setBottomPanelView,
            summaryTabId,
            toast,
        ],
    );

    // Something outside this component (closing the tab, say) needs one of this
    // tab's results in front so its panel can ask about unsaved edits.
    const resultRevealRequest = useResultStore(state => state.resultRevealRequest);
    useEffect(() => {
        if (!resultRevealRequest) return;
        if (![...globalActiveResultKeys, ...keptResultKeys].includes(resultRevealRequest.key)) {
            return;
        }
        setActiveSubTabId(resultRevealRequest.key);
        setBottomPanelView('result');
        // Only a new request should act, not every change to the key lists.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resultRevealRequest?.nonce]);

    const explainTabs = useMemo(
        () =>
            EXPLAIN_TAB_KEYS.flatMap(tab => {
                if (!globalActiveTabId) return [];
                const resultId = `${globalActiveTabId}::explain:${tab.resultSuffix}`;
                const result = results[resultId];
                if (!result) return [];
                return [
                    {
                        id: tab.id,
                        label: tab.label,
                        running: result.executionState === 'running',
                    },
                ];
            }),
        [globalActiveTabId, results],
    );

    const handleCloseExplainTab = React.useCallback(
        (tabId: (typeof EXPLAIN_TAB_KEYS)[number]['id']) => {
            if (!globalActiveTabId) return;

            const resultSuffix = tabId === 'explain-analyze' ? 'analyze' : 'plan';
            clearResult(`${globalActiveTabId}::explain:${resultSuffix}`);

            const isClosingActive = bottomPanelView === 'panel' && activeBottomPanelId === tabId;
            if (!isClosingActive) return;

            const nextExplainTab = explainTabs.find(item => item.id !== tabId);
            if (nextExplainTab) {
                setBottomPanelView('panel');
                setActiveBottomPanelId(nextExplainTab.id);
                return;
            }

            setBottomPanelView('result');
        },
        [
            activeBottomPanelId,
            bottomPanelView,
            clearResult,
            explainTabs,
            globalActiveTabId,
            setActiveBottomPanelId,
            setBottomPanelView,
        ],
    );

    // Registered once — audit/output/app-log/query-stats are the built-in
    // Bottom Panel registrants; a future Terminal (or any extension) adds
    // itself the same way via pluginRegistry.registerBottomPanel.
    React.useEffect(() => {
        registerBuiltInBottomPanels();
    }, []);

    // Fall back to the first registered panel if the persisted/active id no
    // longer exists (e.g. an extension that provided it was disabled) — the
    // two explain pseudo-ids are handled by ResultPanelLogPane directly and
    // are intentionally not looked up in the registry.
    React.useEffect(() => {
        if (bottomPanelView !== 'panel') return;
        if (activeBottomPanelId === 'explain-plan' || activeBottomPanelId === 'explain-analyze') {
            return;
        }
        if (bottomPanels.length === 0) return;
        const hasActivePanel = bottomPanels.some(panel => panel.id === activeBottomPanelId);
        if (!hasActivePanel) {
            setActiveBottomPanelId(bottomPanels[0].id);
        }
    }, [activeBottomPanelId, bottomPanelView, bottomPanels, setActiveBottomPanelId]);

    const { activeDragTab, sensors, handleDragStart, handleDragEnd } = useQueryTabsDnD({
        groups,
        moveTab,
        splitGroupFromDrag,
        setActiveGroupId,
    });

    if (groups.length === 0 || (groups.length === 1 && groups[0].tabs.length === 0)) {
        return <QueryTabsEmptyState onNewQuery={() => addTab()} isConnected={isConnected} />;
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className='flex flex-col h-full w-full overflow-hidden'>
                <TabSwitcherOverlay
                    open={tabSwitcher.open}
                    orderedIds={tabSwitcher.orderedIds}
                    index={tabSwitcher.index}
                    tabMetaById={tabMetaById}
                    onSelect={selectTab}
                />

                <Allotment vertical>
                    <Allotment.Pane visible={!isResultMaximized} className='pb-0.5'>
                        {/* One shell around every split group — the panes inside
                            are divided by a hairline, not re-boxed each. */}
                        <div className='h-full w-full overflow-hidden rounded-md border border-(--border-panel) bg-card'>
                            <Allotment separator={false}>
                                {groups.map((group, index) => (
                                    <Allotment.Pane key={group.id} minSize={300}>
                                        <div
                                            className={
                                                index > 0
                                                    ? 'flex flex-col h-full border-l border-(--border-panel)'
                                                    : 'flex flex-col h-full'
                                            }
                                        >
                                            <QueryGroup
                                                group={group}
                                                isActiveGroup={group.id === activeGroupId}
                                            />
                                        </div>
                                    </Allotment.Pane>
                                ))}
                            </Allotment>
                        </div>
                    </Allotment.Pane>

                    <Allotment.Pane
                        preferredSize={isResultMaximized ? '100%' : '50%'}
                        minSize={100}
                        className='pt-0.5'
                        visible={showResultPanel}
                    >
                        <div className='h-full flex flex-col bg-card overflow-hidden rounded-md border border-(--border-panel) p-1'>
                            <ResultBottomPanelTabBar
                                resultTabs={resultTabs}
                                activeResultTabId={currentResultTabId}
                                explainTabs={explainTabs}
                                activeExplainTabId={
                                    bottomPanelView === 'panel' &&
                                    (activeBottomPanelId === 'explain-plan' ||
                                        activeBottomPanelId === 'explain-analyze')
                                        ? activeBottomPanelId
                                        : null
                                }
                                bottomPanels={bottomPanels}
                                activeBottomPanelId={
                                    bottomPanelView === 'panel' ? activeBottomPanelId : null
                                }
                                bottomPanelView={bottomPanelView}
                                onSelectResultTab={subTabId => {
                                    setActiveSubTabId(subTabId);
                                    setBottomPanelView('result');
                                }}
                                onCloseResultTab={handleCloseResultTab}
                                onToggleBottomPanel={id => {
                                    const isActive =
                                        bottomPanelView === 'panel' && activeBottomPanelId === id;
                                    if (isActive) {
                                        setBottomPanelView('result');
                                        return;
                                    }

                                    setBottomPanelView('panel');
                                    setActiveBottomPanelId(id);
                                }}
                                onCloseExplainTab={tabId =>
                                    handleCloseExplainTab(
                                        tabId as (typeof EXPLAIN_TAB_KEYS)[number]['id'],
                                    )
                                }
                            />

                            <div className='flex-1 overflow-hidden relative'>
                                {bottomPanelView === 'panel' ? (
                                    (bottomPanels
                                        .find(p => p.id === activeBottomPanelId)
                                        ?.render() ?? <ResultPanelLogPane />)
                                ) : isMessagesTab ? (
                                    <ServerMessagesPanel messages={serverMessages} />
                                ) : isSummaryTab && runTotals ? (
                                    <ExecutionSummaryPanel
                                        results={globalActiveResultKeys.flatMap(key =>
                                            results[key] ? [results[key]] : [],
                                        )}
                                        totals={runTotals}
                                    />
                                ) : currentResultTabId ? (
                                    <ResultPanel
                                        key={`${currentResultTabId}:${currentResultEpoch}`}
                                        tabId={currentResultTabId}
                                        contextTabId={globalActiveTabId || undefined}
                                        result={currentResult}
                                        onRun={
                                            isTransactionWrap || isKeptResult
                                                ? undefined
                                                : handleReloadCurrentResult
                                        }
                                        onFilterRun={handleFilterRunGlobal}
                                        transactionSummary={transactionSummary}
                                        baseQuery={
                                            splitLastQuery(
                                                globalActiveTab?.query || '',
                                            ).base.trim() || globalActiveTab?.query
                                        }
                                        onAppendToQuery={handleAppendToQuery}
                                        onOpenInNewTab={handleOpenFilterInNewTab}
                                        isReadOnlyTab={
                                            Boolean(globalActiveTab?.readOnly) ||
                                            isReadOnlySubTab ||
                                            viewMode
                                        }
                                        generatedKind={generatedKind}
                                        showResultFilterBar={!isKeptResult}
                                        isMaximized={isResultMaximized}
                                        onToggleMaximize={() => setIsResultMaximized(prev => !prev)}
                                    />
                                ) : (
                                    <div className='h-full' />
                                )}
                            </div>
                        </div>
                    </Allotment.Pane>
                </Allotment>
            </div>

            <DragOverlay
                dropAnimation={{
                    duration: 220,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                }}
            >
                {activeDragTab ? (
                    <div className='flex h-8 min-w-30 max-w-56 cursor-grabbing items-center gap-1.5 rounded-md border border-dashed border-primary/70 bg-card px-2.5 text-small text-foreground shadow-elevation-md'>
                        <span className='overflow-hidden text-ellipsis whitespace-nowrap'>
                            {activeDragTab.name}
                        </span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};
