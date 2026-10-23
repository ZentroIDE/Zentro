// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import {
    EditorExecutionStrategy,
    FilterExecutionStrategy,
    resolveExecutionStrategy,
    registerExecutionStrategy,
} from './executionStrategies';
import type { ExecutionContext, ExecutionStrategy } from './executionStrategies';

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
    const updateTabContext = vi.fn();
    return {
        sourceTabId: 'tab-1',
        resultTabIds: ['tab-1', 'tab-1::result:2', 'tab-1::explain:plan', 'tab-2'],
        editorQuery: 'SELECT * FROM t',
        filterExpr: '',
        orderByExpr: '',
        filterBaseQuery: undefined,
        clearResultFilterExpr: vi.fn(),
        clearResultOrderByExpr: vi.fn(),
        updateTabContext,
        ...overrides,
    };
}

describe('EditorExecutionStrategy', () => {
    const strategy = new EditorExecutionStrategy();

    it('has id "editor"', () => {
        expect(strategy.id).toBe('editor');
    });

    describe('onPreExecute', () => {
        it('clears filter/order state on related result tabs', () => {
            const clearResultFilterExpr = vi.fn();
            const clearResultOrderByExpr = vi.fn();
            const updateTabContext = vi.fn();
            const ctx = makeContext({
                clearResultFilterExpr,
                clearResultOrderByExpr,
                updateTabContext,
            });

            strategy.onPreExecute(ctx);

            expect(clearResultFilterExpr).toHaveBeenCalledTimes(3);
            expect(clearResultFilterExpr).toHaveBeenCalledWith('tab-1');
            expect(clearResultFilterExpr).toHaveBeenCalledWith('tab-1::result:2');
            expect(clearResultFilterExpr).toHaveBeenCalledWith('tab-1::explain:plan');
            expect(clearResultOrderByExpr).toHaveBeenCalledTimes(3);
            expect(clearResultOrderByExpr).toHaveBeenCalledWith('tab-1');
            expect(clearResultOrderByExpr).toHaveBeenCalledWith('tab-1::result:2');
            expect(clearResultOrderByExpr).toHaveBeenCalledWith('tab-1::explain:plan');
            expect(updateTabContext).toHaveBeenCalledWith('tab-1', {
                resultFilterExpr: '',
                resultOrderByExpr: '',
                resultQuickFilter: '',
                resultFilterBaseQuery: '',
            });
        });

        it('does not touch unrelated tabs', () => {
            const clearResultFilterExpr = vi.fn();
            strategy.onPreExecute(makeContext({ clearResultFilterExpr }));

            expect(clearResultFilterExpr).not.toHaveBeenCalledWith('tab-2');
        });
    });

    describe('resolveQuery', () => {
        it('returns raw editor query unchanged', () => {
            const result = strategy.resolveQuery(
                makeContext({ editorQuery: 'SELECT * FROM inventory_balance' }),
            );
            expect(result).toBe('SELECT * FROM inventory_balance');
        });

        it('ignores filter/order expressions', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterExpr: 'id = 1',
                    orderByExpr: 'id DESC',
                    filterBaseQuery: 'SELECT * FROM base',
                }),
            );
            expect(result).toBe('SELECT * FROM t');
        });
    });
});

describe('FilterExecutionStrategy', () => {
    const strategy = new FilterExecutionStrategy();

    it('has id "filter"', () => {
        expect(strategy.id).toBe('filter');
    });

    describe('onPreExecute', () => {
        it('preserves filter/order state (no-op)', () => {
            const clearResultFilterExpr = vi.fn();
            const clearResultOrderByExpr = vi.fn();
            const updateTabContext = vi.fn();

            strategy.onPreExecute(
                makeContext({
                    clearResultFilterExpr,
                    clearResultOrderByExpr,
                    updateTabContext,
                }),
            );

            expect(clearResultFilterExpr).not.toHaveBeenCalled();
            expect(clearResultOrderByExpr).not.toHaveBeenCalled();
            expect(updateTabContext).not.toHaveBeenCalled();
        });
    });

    describe('resolveQuery', () => {
        it('returns raw base query when no filter or order', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterBaseQuery: 'SELECT * FROM t',
                    filterExpr: '',
                    orderByExpr: '',
                }),
            );
            expect(result).toBe('SELECT * FROM t');
        });

        it('falls back to editorQuery when filterBaseQuery is undefined', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterBaseQuery: undefined,
                    filterExpr: '',
                    orderByExpr: '',
                }),
            );
            expect(result).toBe('SELECT * FROM t');
        });

        it('builds filter query with WHERE clause', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterBaseQuery: 'SELECT * FROM t',
                    filterExpr: 'id = 1',
                }),
            );
            expect(result).toContain('where id = 1');
        });

        it('builds ordered query with ORDER BY', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterBaseQuery: 'SELECT * FROM t',
                    orderByExpr: 'id DESC',
                }),
            );
            expect(result.toLowerCase()).toContain('order by id desc');
        });

        it('applies both filter and order', () => {
            const result = strategy.resolveQuery(
                makeContext({
                    editorQuery: 'SELECT * FROM t',
                    filterBaseQuery: 'SELECT * FROM t',
                    filterExpr: 'id = 1',
                    orderByExpr: 'name ASC',
                }),
            );
            const lower = result.toLowerCase();
            expect(lower).toContain('where id = 1');
            expect(lower).toContain('order by name asc');
        });
    });
});

describe('resolveExecutionStrategy', () => {
    it('returns EditorExecutionStrategy for "editor" source', () => {
        const strategy = resolveExecutionStrategy('editor');
        expect(strategy).toBeInstanceOf(EditorExecutionStrategy);
        expect(strategy.id).toBe('editor');
    });

    it('returns FilterExecutionStrategy for "filter" source', () => {
        const strategy = resolveExecutionStrategy('filter');
        expect(strategy).toBeInstanceOf(FilterExecutionStrategy);
        expect(strategy.id).toBe('filter');
    });

    it('defaults to EditorExecutionStrategy for unknown source', () => {
        const strategy = resolveExecutionStrategy('other');
        expect(strategy).toBeInstanceOf(EditorExecutionStrategy);
        expect(strategy.id).toBe('editor');
    });
});

describe('registerExecutionStrategy', () => {
    it('allows registering a custom strategy that resolves by id', () => {
        const custom: ExecutionStrategy = {
            id: 'custom',
            onPreExecute: vi.fn(),
            resolveQuery: () => 'CUSTOM QUERY',
        };
        registerExecutionStrategy(custom);

        const resolved = resolveExecutionStrategy('custom');
        expect(resolved).toBe(custom);
        expect(resolved.id).toBe('custom');
        expect(resolved.resolveQuery(makeContext())).toBe('CUSTOM QUERY');
    });

    it('overrides existing strategy when same id is registered', () => {
        const override: ExecutionStrategy = {
            id: 'editor',
            onPreExecute: vi.fn(),
            resolveQuery: () => 'OVERRIDDEN',
        };
        registerExecutionStrategy(override);
        expect(resolveExecutionStrategy('editor').id).toBe('editor');

        // Restore original for other tests
        registerExecutionStrategy(new EditorExecutionStrategy());
    });
});
