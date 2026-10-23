// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SettingsStatusBar } from './SettingsStatusBar';

function renderSection(overrides: Partial<React.ComponentProps<typeof SettingsStatusBar>> = {}) {
    const props = {
        enabled: true,
        onEnabledChange: vi.fn(),
        showLatency: true,
        onShowLatencyChange: vi.fn(),
        showNetwork: true,
        onShowNetworkChange: vi.fn(),
        showResources: true,
        onShowResourcesChange: vi.fn(),
        intervalMs: 2000 as const,
        onIntervalMsChange: vi.fn(),
        ...overrides,
    };
    render(<SettingsStatusBar {...props} />);
    return props;
}

describe('SettingsStatusBar', () => {
    it('reports each toggle to its own callback', () => {
        const props = renderSection();

        fireEvent.click(screen.getByRole('switch', { name: 'Show live stats' }));
        fireEvent.click(screen.getByRole('switch', { name: 'Database latency' }));
        fireEvent.click(screen.getByRole('switch', { name: 'Network traffic' }));
        fireEvent.click(screen.getByRole('switch', { name: 'CPU and memory' }));

        expect(props.onEnabledChange).toHaveBeenCalledWith(false);
        expect(props.onShowLatencyChange).toHaveBeenCalledWith(false);
        expect(props.onShowNetworkChange).toHaveBeenCalledWith(false);
        expect(props.onShowResourcesChange).toHaveBeenCalledWith(false);
    });

    it('marks the current interval as pressed and changes it on click', () => {
        const props = renderSection({ intervalMs: 2000 });

        expect(screen.getByRole('button', { name: '2s' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '5s' })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: '5s' }));
        expect(props.onIntervalMsChange).toHaveBeenCalledWith(5000);
    });

    it('disables the detail controls while stats are off', () => {
        renderSection({ enabled: false });

        expect(screen.getByRole('switch', { name: 'Show live stats' })).toBeEnabled();
        expect(screen.getByRole('switch', { name: 'Database latency' })).toBeDisabled();
        expect(screen.getByRole('switch', { name: 'Network traffic' })).toBeDisabled();
        expect(screen.getByRole('switch', { name: 'CPU and memory' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '1s' })).toBeDisabled();
    });
});
