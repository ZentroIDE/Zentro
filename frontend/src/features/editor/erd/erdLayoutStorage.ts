// SPDX-License-Identifier: GPL-3.0-only

import type { ErdPositions } from './erdLayout';

const KEY_PREFIX = 'zentro:erd-layout-v1';

export interface ErdLayoutScope {
    connectionID: string;
    dbName: string;
    schema: string;
    table: string;
}

export function buildErdLayoutKey({ connectionID, dbName, schema, table }: ErdLayoutScope): string {
    return [KEY_PREFIX, ...[connectionID, dbName, schema, table].map(encodeURIComponent)].join(':');
}

function sanitize(raw: unknown): ErdPositions | null {
    if (!raw || typeof raw !== 'object') return null;
    const positions = (raw as { positions?: unknown }).positions;
    if (!positions || typeof positions !== 'object') return null;

    const clean: ErdPositions = {};
    for (const [id, point] of Object.entries(positions as Record<string, unknown>)) {
        const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x + y)) {
            clean[id] = { x, y };
        }
    }
    return Object.keys(clean).length > 0 ? clean : null;
}

export function loadErdLayout(key: string): ErdPositions | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? sanitize(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export function saveErdLayout(key: string, positions: ErdPositions): void {
    try {
        localStorage.setItem(key, JSON.stringify({ positions }));
    } catch {
        // Storage can be unavailable or full; layout persistence is best effort.
    }
}

export function clearErdLayout(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // See saveErdLayout.
    }
}
