// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabResult } from '../../../stores/resultStore';
import {
    ResultColumnVisibilityPopoverContent,
    getResultColumnId,
} from './useResultColumnVisibilityAction';

const sampleResult: TabResult = {
    columns: ['id', 'email', 'created_at'],
    rows: [],
    isDone: true,
    affected: 0,
    duration: 0,
    isSelect: true,
    hasMore: false,
    offset: 0,
    isFetchingMore: false,
    filterExpr: '',
    orderByExpr: '',
    executionState: 'done',
    failureCode: 'none',
    progress: {
        startedAt: 0,
        rowsReceived: 0,
        chunksReceived: 0,
    },
    windowStartOffset: 0,
};

describe('ResultColumnVisibilityPopoverContent', () => {
    it('toggles a single column with checkbox rows', () => {
        const setColumnVisibility = vi.fn();

        render(
            <ResultColumnVisibilityPopoverContent
                result={sampleResult}
                columnVisibility={{}}
                setColumnVisibility={setColumnVisibility}
            />,
        );

        fireEvent.click(screen.getByLabelText('Toggle column email'));

        expect(setColumnVisibility).toHaveBeenCalledTimes(1);
        const updater = setColumnVisibility.mock.calls[0][0] as (
            prev: Record<string, boolean>,
        ) => Record<string, boolean>;
        expect(updater({})).toEqual({
            [getResultColumnId('email', 1)]: false,
        });
    });

    it('restores all columns when reset is clicked', () => {
        const setColumnVisibility = vi.fn();

        render(
            <ResultColumnVisibilityPopoverContent
                result={sampleResult}
                columnVisibility={{
                    [getResultColumnId('email', 1)]: false,
                }}
                setColumnVisibility={setColumnVisibility}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

        expect(setColumnVisibility).toHaveBeenCalledWith({});
    });
});
