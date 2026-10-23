// SPDX-License-Identifier: GPL-3.0-only

import { buildFilterOrderQuery } from './queryBuilder';
import { isKeptResultKey } from './resultKeys';
import type { TabQueryContext } from '../stores/editor/types';

export interface ExecutionContext {
    sourceTabId: string;
    resultTabIds: string[];
    editorQuery: string;
    filterExpr?: string;
    orderByExpr?: string;
    filterBaseQuery?: string;
    clearResultFilterExpr: (tabId: string) => void;
    clearResultOrderByExpr: (tabId: string) => void;
    updateTabContext: (tabId: string, patch: Partial<TabQueryContext>) => void;
}

export interface ExecutionStrategy {
    readonly id: string;
    onPreExecute(ctx: ExecutionContext): void;
    resolveQuery(ctx: ExecutionContext): string;
}
export class EditorExecutionStrategy implements ExecutionStrategy {
    readonly id = 'editor';

    onPreExecute(ctx: ExecutionContext): void {
        const relatedTabIds = ctx.resultTabIds.filter(
            tabId =>
                !isKeptResultKey(tabId) &&
                (tabId === ctx.sourceTabId ||
                    tabId.startsWith(`${ctx.sourceTabId}::result:`) ||
                    tabId.startsWith(`${ctx.sourceTabId}::explain:`)),
        );
        for (const tabId of relatedTabIds) {
            ctx.clearResultFilterExpr(tabId);
            ctx.clearResultOrderByExpr(tabId);
        }
        ctx.updateTabContext(ctx.sourceTabId, {
            resultFilterExpr: '',
            resultOrderByExpr: '',
            resultQuickFilter: '',
            resultFilterBaseQuery: '',
        });
    }

    resolveQuery(ctx: ExecutionContext): string {
        return ctx.editorQuery;
    }
}
export class FilterExecutionStrategy implements ExecutionStrategy {
    readonly id = 'filter';

    onPreExecute(_ctx: ExecutionContext): void {
        // Preserve filter/order state — no clearing needed.
    }

    resolveQuery(ctx: ExecutionContext): string {
        const baseQuery = ctx.filterBaseQuery ?? ctx.editorQuery;
        const nextFilter = (ctx.filterExpr || '').trim();
        const nextOrderBy = (ctx.orderByExpr || '').trim();
        if (!nextFilter && !nextOrderBy) {
            return baseQuery;
        }
        return buildFilterOrderQuery(baseQuery, nextFilter, nextOrderBy);
    }
}
const strategies: Record<string, ExecutionStrategy> = {
    editor: new EditorExecutionStrategy(),
    filter: new FilterExecutionStrategy(),
};

export function resolveExecutionStrategy(source: string): ExecutionStrategy {
    return strategies[source] ?? strategies.editor;
}

export function registerExecutionStrategy(strategy: ExecutionStrategy): void {
    strategies[strategy.id] = strategy;
}
