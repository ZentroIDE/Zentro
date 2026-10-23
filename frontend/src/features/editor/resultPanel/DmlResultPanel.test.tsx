// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DmlResultPanel } from './DmlResultPanel';
import type { TabResult } from '../../../stores/resultStore';
import { useResultStore } from '../../../stores/resultStore';

function createResult(overrides: Partial<TabResult> = {}): TabResult {
    return {
        columns: [],
        rows: [],
        isDone: true,
        affected: 1,
        duration: 8,
        isSelect: false,
        hasMore: false,
        offset: 0,
        isFetchingMore: false,
        filterExpr: '',
        orderByExpr: '',
        lastExecutedQuery: 'DELETE FROM "app"."orders" WHERE "order_id" = 100008',
        executionState: 'done',
        failureCode: 'none',
        progress: {
            startedAt: Date.now(),
            rowsReceived: 0,
            chunksReceived: 0,
        },
        windowStartOffset: 0,
        ...overrides,
    };
}

describe('DmlResultPanel', () => {
    it('renders statistics table with query metrics', () => {
        render(<DmlResultPanel result={createResult()} />);

        expect(screen.getByText('Affected Rows')).toBeInTheDocument();
        expect(screen.getByText('1 row deleted')).toBeInTheDocument();
        expect(screen.getByText('Execute time')).toBeInTheDocument();
        expect(screen.getByText('0.008s')).toBeInTheDocument();
        expect(screen.getByText('Transaction')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
        expect(screen.getByText('Query')).toBeInTheDocument();
        expect(
            screen.getByText(/DELETE FROM "app"\."orders" WHERE "order_id" = 100008/),
        ).toBeInTheDocument();
    });

    it('handles leading comments correctly when parsing query metadata', () => {
        const result = createResult({
            lastExecutedQuery: `-- line comment\n/* block comment */\nDELETE FROM "app"."orders" WHERE "order_id" = 100008`,
        });
        render(<DmlResultPanel result={result} />);

        expect(screen.getByText('Affected Rows')).toBeInTheDocument();
        expect(screen.getByText('1 row deleted')).toBeInTheDocument();
    });

    it('identifies manual transactions correctly', () => {
        const result = createResult({
            lastExecutedQuery: `BEGIN;\nDELETE FROM "app"."orders" WHERE "order_id" = 100008;\nCOMMIT;`,
        });
        render(<DmlResultPanel result={result} />);

        expect(screen.getByText('Transaction')).toBeInTheDocument();
        expect(screen.getByText('Yes (Manual)')).toBeInTheDocument();
    });

    it('identifies auto-wrapped transactions correctly', () => {
        useResultStore.getState().setTransactionWrap('test-tab', true);
        const result = createResult();
        render(<DmlResultPanel result={result} tabId='test-tab' />);

        expect(screen.getByText('Transaction')).toBeInTheDocument();
        expect(screen.getByText('Yes (Auto-wrapped)')).toBeInTheDocument();
    });

    it('handles transactionSummary statistics correctly for pure DML', () => {
        const summary = {
            statements: [
                {
                    tabResultKey: 'test-tab::result:0',
                    statementText: 'BEGIN;',
                    affected: 0,
                    duration: 1,
                    isSelect: false,
                    isDone: true,
                },
                {
                    tabResultKey: 'test-tab::result:1',
                    statementText: 'DELETE FROM "app"."orders" WHERE "order_id" = 100019;',
                    affected: 1,
                    duration: 2,
                    isSelect: false,
                    isDone: true,
                },
                {
                    tabResultKey: 'test-tab::result:2',
                    statementText: 'DELETE FROM "app"."orders" WHERE "order_id" = 100020;',
                    affected: 1,
                    duration: 3,
                    isSelect: false,
                    isDone: true,
                },
                {
                    tabResultKey: 'test-tab::result:3',
                    statementText: 'COMMIT;',
                    affected: 0,
                    duration: 1,
                    isSelect: false,
                    isDone: true,
                },
            ],
            totalDuration: 7,
            isComplete: true,
            hasError: false,
        };

        render(<DmlResultPanel transactionSummary={summary} tabId='test-tab' />);

        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Transaction completed')).toBeInTheDocument();
        expect(screen.getByText('Affected Rows')).toBeInTheDocument();
        expect(screen.getByText('2 rows deleted')).toBeInTheDocument();
        expect(screen.getByText('Execute time')).toBeInTheDocument();
        expect(screen.getByText('0.007s')).toBeInTheDocument();
    });

    it('handles transactionSummary with multiple types of DML statements', () => {
        const summary = {
            statements: [
                {
                    tabResultKey: 'test-tab::result:0',
                    statementText: 'INSERT INTO "app"."orders" VALUES (1);',
                    affected: 1,
                    duration: 2,
                    isSelect: false,
                    isDone: true,
                },
                {
                    tabResultKey: 'test-tab::result:1',
                    statementText: 'UPDATE "app"."orders" SET amount = 100 WHERE id = 1;',
                    affected: 2,
                    duration: 3,
                    isSelect: false,
                    isDone: true,
                },
            ],
            totalDuration: 5,
            isComplete: true,
            hasError: false,
        };

        render(<DmlResultPanel transactionSummary={summary} tabId='test-tab' />);

        expect(screen.getByText('1 row inserted, 2 rows updated')).toBeInTheDocument();
    });

    it('renders error row when statement in transaction fails', () => {
        const summary = {
            statements: [
                {
                    tabResultKey: 'test-tab::result:0',
                    statementText: 'DELETE FROM "app"."orders" WHERE "order_id" = 100019;',
                    affected: 0,
                    duration: 2,
                    isSelect: false,
                    error: 'Table app.orders does not exist',
                    isDone: true,
                },
            ],
            totalDuration: 2,
            isComplete: true,
            hasError: true,
        };

        render(<DmlResultPanel transactionSummary={summary} tabId='test-tab' />);

        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Transaction failed')).toBeInTheDocument();
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText('Table app.orders does not exist')).toBeInTheDocument();
    });
});
