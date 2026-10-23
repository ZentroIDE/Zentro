// SPDX-License-Identifier: GPL-3.0-only

import { describe, it, expect } from 'vitest';

import { formatBytes, formatBytesPerSec, formatLatency, formatPercent } from './formatStats';

describe('formatBytes', () => {
    it('uses binary units and drops a trailing .0', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(812)).toBe('812 B');
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(3.4 * 1024)).toBe('3.4 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
        expect(formatBytes(210 * 1024 * 1024)).toBe('210 MB');
        expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
    });

    it('treats garbage as zero rather than printing NaN', () => {
        expect(formatBytes(NaN)).toBe('0 B');
        expect(formatBytes(-5)).toBe('0 B');
        expect(formatBytes(Infinity)).toBe('0 B');
    });
});

describe('formatBytesPerSec', () => {
    it('appends the per-second unit', () => {
        expect(formatBytesPerSec(0)).toBe('0 B/s');
        expect(formatBytesPerSec(2048)).toBe('2 KB/s');
    });
});

describe('formatLatency', () => {
    it('keeps sub-10ms precision, rounds to whole ms, then switches to seconds', () => {
        expect(formatLatency(0.4)).toBe('0.4 ms');
        expect(formatLatency(12.6)).toBe('13 ms');
        expect(formatLatency(340)).toBe('340 ms');
        expect(formatLatency(1200)).toBe('1.2 s');
    });

    it('shows a dash for an unusable value', () => {
        expect(formatLatency(NaN)).toBe('-');
        expect(formatLatency(-1)).toBe('-');
    });
});

describe('formatPercent', () => {
    it('shows <1% for a small but non-zero load and whole numbers otherwise', () => {
        expect(formatPercent(0)).toBe('0%');
        expect(formatPercent(0.3)).toBe('<1%');
        expect(formatPercent(3.4)).toBe('3%');
        expect(formatPercent(100)).toBe('100%');
        expect(formatPercent(NaN)).toBe('0%');
    });
});
