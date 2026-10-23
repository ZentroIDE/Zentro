// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    formatBytes,
    formatBytesPerSec,
    formatLatency,
    formatPercent,
} from '../../lib/formatStats';
import { useLiveStatsStore } from '../../stores/liveStatsStore';
import { isStatsSamplingWanted, useStatusBarStatsStore } from '../../stores/statusBarStatsStore';
import type { StatsSample } from '../../platform/app-api/contracts/stats';

const itemClass = 'shrink-0 cursor-help text-label! font-normal text-background/78 tabular-nums';

function latencyText(sample: StatsSample): { text: string; title: string } | null {
    switch (sample.latencyState) {
        case 'ok':
            return {
                text: formatLatency(sample.latencyMs ?? 0),
                title: 'Database latency: round trip of a ping to the connected server',
            };
        case 'busy':
            return {
                text: 'busy',
                title: 'Database latency not measured: every connection was busy running a query',
            };
        case 'error':
            return {
                text: 'ping failed',
                title: 'The last ping to the database failed - the connection may be lost',
            };
        default:
            return null; // not connected, or SQLite (no network)
    }
}

/** Live numbers in the status bar: database latency, Zentro's own database
 *  traffic, and its CPU/memory use. Each part follows its own toggle in
 *  Settings > Status Bar; the whole thing renders nothing until the first
 *  sample arrives or when stats are off. */
export const StatusBarStats: React.FC = () => {
    const sample = useLiveStatsStore(s => s.sample);
    const wanted = useStatusBarStatsStore(isStatsSamplingWanted);
    const showLatency = useStatusBarStatsStore(s => s.showLatency);
    const showNetwork = useStatusBarStatsStore(s => s.showNetwork);
    const showResources = useStatusBarStatsStore(s => s.showResources);

    if (!wanted || !sample) return null;

    const latency = showLatency ? latencyText(sample) : null;

    return (
        <div className='flex items-center gap-3' data-testid='status-bar-stats'>
            {latency && (
                <span className={itemClass} title={latency.title}>
                    {latency.text}
                </span>
            )}
            {showNetwork && (
                <span
                    className={itemClass}
                    title="Zentro's database traffic: download (↓) and upload (↑) over the wire, including TLS and SSH tunnel overhead"
                >
                    ↓ {formatBytesPerSec(sample.rxBytesPerSec)} ↑{' '}
                    {formatBytesPerSec(sample.txBytesPerSec)}
                </span>
            )}
            {showResources && (
                <span
                    className={itemClass}
                    title='Zentro CPU (share of the whole machine) and private memory, including the UI renderer processes (WebView2). Matches the sum of those processes in Task Manager'
                >
                    CPU {formatPercent(sample.cpuPercent)} · {formatBytes(sample.memBytes)}
                </span>
            )}
        </div>
    );
};
