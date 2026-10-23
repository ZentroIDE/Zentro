// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { StatusBarStats } from './StatusBarStats';
import { useLiveStatsStore } from '../../stores/liveStatsStore';
import { useStatusBarStatsStore } from '../../stores/statusBarStatsStore';
import type { StatsSample } from '../../platform/app-api/contracts/stats';

const sample: StatsSample = {
    at: 1,
    latencyMs: 12.4,
    latencyState: 'ok',
    rxBytesPerSec: 2048,
    txBytesPerSec: 512,
    cpuPercent: 3.2,
    memBytes: 210 * 1024 * 1024,
};

function setSample(next: StatsSample | null) {
    act(() => {
        if (next) useLiveStatsStore.getState().setSample(next);
        else useLiveStatsStore.getState().clear();
    });
}

describe('StatusBarStats', () => {
    beforeEach(() => {
        useLiveStatsStore.getState().clear();
        useStatusBarStatsStore.setState({
            enabled: true,
            showLatency: true,
            showNetwork: true,
            showResources: true,
            intervalMs: 2000,
        });
    });

    it('renders nothing until the first sample arrives', () => {
        render(<StatusBarStats />);
        expect(screen.queryByTestId('status-bar-stats')).not.toBeInTheDocument();
    });

    it('shows latency, traffic and resource use from a sample', () => {
        render(<StatusBarStats />);
        setSample(sample);

        expect(screen.getByText('12 ms')).toBeInTheDocument();
        expect(screen.getByText(/↓ 2 KB\/s ↑ 512 B\/s/)).toBeInTheDocument();
        expect(screen.getByText('CPU 3% · 210 MB')).toBeInTheDocument();
    });

    it('hides each part when its toggle is off', () => {
        render(<StatusBarStats />);
        setSample(sample);
        act(() => useStatusBarStatsStore.getState().setShowNetwork(false));
        expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
        expect(screen.getByText('12 ms')).toBeInTheDocument();

        act(() => useStatusBarStatsStore.getState().setShowLatency(false));
        expect(screen.queryByText('12 ms')).not.toBeInTheDocument();
        expect(screen.getByText(/CPU/)).toBeInTheDocument();
    });

    it('renders nothing when stats are switched off', () => {
        render(<StatusBarStats />);
        setSample(sample);
        act(() => useStatusBarStatsStore.getState().setEnabled(false));
        expect(screen.queryByTestId('status-bar-stats')).not.toBeInTheDocument();
    });

    it('says so when the database is busy or the ping failed, and hides latency when there is none', () => {
        render(<StatusBarStats />);

        setSample({ ...sample, latencyMs: null, latencyState: 'busy' });
        expect(screen.getByText('busy')).toBeInTheDocument();

        setSample({ ...sample, latencyMs: null, latencyState: 'error' });
        expect(screen.getByText('ping failed')).toBeInTheDocument();

        setSample({ ...sample, latencyMs: null, latencyState: 'none' });
        expect(screen.queryByText('busy')).not.toBeInTheDocument();
        expect(screen.queryByText('ping failed')).not.toBeInTheDocument();
        expect(screen.getByText(/CPU/)).toBeInTheDocument();
    });
});
