// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ServerSessionsToolbar } from './ServerSessionsToolbar';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';

function makeSession(overrides: Partial<ServerSession> = {}): ServerSession {
    return {
        id: '100',
        user: 'app',
        database: 'shop',
        client: '10.0.0.1:5432',
        state: 'active',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        wait: '',
        query: 'SELECT 1',
        isSelf: false,
        ...overrides,
    };
}

function baseProps() {
    return {
        filter: 'active' as const,
        setFilter: vi.fn(),
        intervalMs: 5000,
        setIntervalMs: vi.fn(),
        filtered: [makeSession()],
        loading: false,
        refresh: vi.fn(async () => {}),
    };
}

describe('ServerSessionsToolbar', () => {
    it('shows the filtered session count', () => {
        render(
            <ServerSessionsToolbar {...baseProps()} filtered={[makeSession(), makeSession()]} />,
        );
        expect(screen.getByText('2 sessions')).toBeInTheDocument();
    });

    it('calls refresh when the refresh icon is clicked', () => {
        const props = baseProps();
        render(<ServerSessionsToolbar {...props} />);

        fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }));

        expect(props.refresh).toHaveBeenCalledTimes(1);
    });

    it('disables the refresh button while loading', () => {
        render(<ServerSessionsToolbar {...baseProps()} loading />);
        expect(screen.getByRole('button', { name: 'Refresh sessions' })).toBeDisabled();
    });
});
