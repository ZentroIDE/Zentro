// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useEditorStore } from '../../stores/editorStore';
import { useResultStore } from '../../stores/resultStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { useToast } from '../../components/layout/Toast';
import { splitLastQuery } from '../../lib/queryBuilder';
import {
    applyPreExecuteFilterPolicy,
    type QueryExecutionSource,
    resolveExecuteQuery,
} from '../../lib/queryExecutionRouting';

interface UseTabExecutionArgs {
    /** Read by `handleFilterRunGlobal` to derive a sensible filter base when the
     *  caller didn't pass one. Allowed to be `undefined`. */
    lastExecutedQuery?: string;
}

/**
 * Bundles the four "execute the active tab" handlers used by QueryTabs. Each
 * one snapshots the editor store on call so it doesn't grow stale across
 * renders or async boundaries.
 *
 * Returns a stable record so QueryTabs can wire callbacks to children without
 * causing re-renders on every store change.
 */
export function useTabExecution({ lastExecutedQuery }: UseTabExecutionArgs) {
    const isConnected = useConnectionStore(s => s.isConnected);
    const addTab = useEditorStore(s => s.addTab);
    const updateTabContext = useEditorStore(s => s.updateTabContext);
    const updateTabQuery = useEditorStore(s => s.updateTabQuery);
    const { toast } = useToast();

    const executeActiveTabQuery = useCallback(
        async (
            source: QueryExecutionSource,
            options?: {
                filterExpr?: string;
                orderByExpr?: string;
                filterBaseQuery?: string;
                queryOverride?: string;
                targetTabId?: string;
            },
        ) => {
            if (!isConnected) return;

            const editorState = useEditorStore.getState();
            const latestActiveGroup = editorState.groups.find(
                group => group.id === editorState.activeGroupId,
            );
            const latestActiveTab = latestActiveGroup?.tabs.find(
                tab => tab.id === latestActiveGroup.activeTabId,
            );
            if (!latestActiveTab) return;

            const resultStore = useResultStore.getState();
            applyPreExecuteFilterPolicy({
                source,
                sourceTabId: latestActiveTab.id,
                resultTabIds: Object.keys(resultStore.results),
                clearResultFilterExpr: tabId => resultStore.setFilterExpr(tabId, ''),
                clearResultOrderByExpr: tabId => resultStore.setOrderByExpr(tabId, ''),
                updateTabContext,
            });

            const queryToRun = resolveExecuteQuery({
                source,
                editorQuery: options?.queryOverride ?? latestActiveTab.query,
                filterExpr: options?.filterExpr,
                orderByExpr: options?.orderByExpr,
                filterBaseQuery: options?.filterBaseQuery,
            });
            const executionTabId = options?.targetTabId || latestActiveTab.id;

            const result = await getApiGateway().query.execute(executionTabId, queryToRun);
            if (!result.ok) {
                console.error(
                    source === 'filter' ? 'ExecuteQuery (filter) error:' : 'ExecuteQuery error:',
                    result.error.message,
                );
                toast.error(`Failed to run query: ${result.error.message}`);
            }
        },
        [isConnected, updateTabContext, toast],
    );

    const handleRunGlobal = useCallback(
        async (queryOverride?: string, targetTabId?: string) => {
            await executeActiveTabQuery('editor', {
                queryOverride,
                targetTabId,
            });
        },
        [executeActiveTabQuery],
    );

    const handleFilterRunGlobal = useCallback(
        async (filter: string, orderByExpr = '', filterBaseQuery = '') => {
            if (!isConnected) return;

            const editorState = useEditorStore.getState();
            const latestActiveGroup = editorState.groups.find(
                group => group.id === editorState.activeGroupId,
            );
            const latestActiveTab = latestActiveGroup?.tabs.find(
                tab => tab.id === latestActiveGroup.activeTabId,
            );
            if (!latestActiveTab) return;

            // Filter should target the current executable statement, not the whole script.
            const baseForFilter =
                filterBaseQuery.trim() ||
                lastExecutedQuery?.trim() ||
                splitLastQuery(latestActiveTab.query || '').base.trim() ||
                latestActiveTab.query;
            updateTabContext(latestActiveTab.id, {
                resultFilterBaseQuery: baseForFilter,
            });
            await executeActiveTabQuery('filter', {
                filterExpr: filter,
                orderByExpr,
                filterBaseQuery: baseForFilter,
            });
        },
        [executeActiveTabQuery, isConnected, lastExecutedQuery, updateTabContext],
    );

    const handleAppendToQuery = useCallback(
        (fullQuery: string) => {
            const editorState = useEditorStore.getState();
            const activeGroup = editorState.groups.find(g => g.id === editorState.activeGroupId);
            const activeTabId = activeGroup?.activeTabId;
            if (!activeTabId) return;
            const currentQuery = activeGroup?.tabs.find(t => t.id === activeTabId)?.query ?? '';
            const sep = currentQuery.trimEnd() ? '\n\n' : '';
            updateTabQuery(activeTabId, currentQuery.trimEnd() + sep + fullQuery);
        },
        [updateTabQuery],
    );

    const handleOpenFilterInNewTab = useCallback(
        (fullQuery: string) => {
            addTab({ name: 'New Query', query: fullQuery });
        },
        [addTab],
    );

    return {
        handleRunGlobal,
        handleFilterRunGlobal,
        handleAppendToQuery,
        handleOpenFilterInNewTab,
    };
}
