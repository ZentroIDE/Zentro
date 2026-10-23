// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ResultPanelStatusBar } from './ResultPanelStatusBar';

const baseProps = {
    visibleRowCount: 200,
    totalCount: 2151,
    hasMore: true,
    duration: 5,
    strategyLabel: 'server_aware',
    strategyTooltip: 'Loads pages from the server',
    executionTimeText: '11:37:53 AM',
    executionTimeTooltip: 'Last fetched at now',
    hasPendingChanges: true,
    pendingChangeCounts: { add: 1, update: 2, del: 8 },
};

describe('ResultPanelStatusBar', () => {
    it('shows strategy, execution time and change counts as labelled icons, not text', () => {
        render(<ResultPanelStatusBar {...baseProps} />);

        expect(screen.getByLabelText(/Strategy: server_aware/)).toBeTruthy();
        expect(screen.getByLabelText(/Executed 11:37:53 AM/)).toBeTruthy();
        expect(screen.getByLabelText('Added rows: 1').textContent).toBe('1');
        expect(screen.getByLabelText('Updated rows: 2').textContent).toBe('2');
        expect(screen.getByLabelText('Deleted rows: 8').textContent).toBe('8');

        expect(screen.queryByText(/strategy:/i)).toBeNull();
        expect(screen.queryByText(/executed:/i)).toBeNull();
        expect(screen.queryByText(/Add:|Update:|Del:/)).toBeNull();
    });

    it('omits the execution icon and change counts when there is nothing to show', () => {
        render(
            <ResultPanelStatusBar
                {...baseProps}
                executionTimeText={null}
                hasPendingChanges={false}
            />,
        );

        expect(screen.queryByLabelText(/Executed/)).toBeNull();
        expect(screen.queryByLabelText(/Added rows/)).toBeNull();
    });
});
