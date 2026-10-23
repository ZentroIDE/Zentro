// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionSummaryPanel } from './ExecutionSummaryPanel';
import type { TabResult } from '../../../stores/resultStore';

function result(overrides: Partial<TabResult> = {}): TabResult {
    return {
        columns: [],
        rows: [],
        isDone: true,
        affected: 0,
        duration: 10,
        isSelect: false,
        hasMore: false,
        offset: 0,
        isFetchingMore: false,
        filterExpr: '',
        orderByExpr: '',
        executionState: 'done',
        failureCode: 'none',
        progress: { startedAt: 1000, rowsReceived: 0, chunksReceived: 0 },
        windowStartOffset: 0,
        ...overrides,
    };
}

describe('ExecutionSummaryPanel', () => {
    it('summarizes the whole run from backend totals, not the throttled results', () => {
        render(
            <ExecutionSummaryPanel
                results={[result(), result({ duration: 20 })]}
                totals={{
                    insertedRows: 1,
                    updatedRows: 0,
                    deletedRows: 2,
                    statementCount: 6,
                    query: 'PRINT 1; PRINT 2;',
                }}
            />,
        );

        expect(screen.getByText('Completed')).toBeTruthy();
        expect(screen.getByText('6')).toBeTruthy();
        expect(screen.getByText('1 row inserted, 2 rows deleted')).toBeTruthy();
        expect(screen.getByText('PRINT 1; PRINT 2;')).toBeTruthy();
    });

    it('reports failure with the error text', () => {
        render(
            <ExecutionSummaryPanel
                results={[result({ error: 'boom' })]}
                totals={{ insertedRows: 0, updatedRows: 0, deletedRows: 0, statementCount: 3 }}
            />,
        );

        expect(screen.getByText('Failed')).toBeTruthy();
        expect(screen.getByText('boom')).toBeTruthy();
    });
});
