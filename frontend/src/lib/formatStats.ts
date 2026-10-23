// SPDX-License-Identifier: GPL-3.0-only

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** "812 B", "3.4 KB", "210 MB", "1.2 GB" — binary units, as Task Manager shows them. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < KB) return `${Math.round(bytes)} B`;
    if (bytes < MB) return `${trim(bytes / KB)} KB`;
    if (bytes < GB) return `${bytes < 10 * MB ? trim(bytes / MB) : Math.round(bytes / MB)} MB`;
    return `${trim(bytes / GB)} GB`;
}

/** "0 B/s", "3.4 KB/s", "1.2 MB/s". */
export function formatBytesPerSec(bytesPerSec: number): string {
    return `${formatBytes(bytesPerSec)}/s`;
}

/** "0.4 ms", "12 ms", "340 ms", "1.2 s": enough precision to read a LAN or WAN round trip. */
export function formatLatency(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    if (ms < 10) return `${trim(ms)} ms`;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${trim(ms / 1000)} s`;
}

/** "3%" — below 1% shows "<1%" so an idle app does not read as exactly zero. */
export function formatPercent(percent: number): string {
    if (!Number.isFinite(percent) || percent <= 0) return '0%';
    if (percent < 1) return '<1%';
    return `${Math.round(percent)}%`;
}

// One decimal, dropping a trailing ".0".
function trim(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}
