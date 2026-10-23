// SPDX-License-Identifier: GPL-3.0-only

import type { PIIDetectionResult } from './piiDetectionTypes';

/**
 * The PII scan that runs over a query result (type B — a hook inside the
 * existing result-panel pipeline, not an additive UI). The core has a
 * detector that finds nothing; a pro_* file (frontend/src/pro/piiDetection/)
 * registers the real one. See usePIIDetection.ts, the only caller.
 */
export type PIIDetector = (columns: string[], rows: string[][]) => PIIDetectionResult;

function emptyResult(rowCount: number): PIIDetectionResult {
    return { hasPII: false, columns: [], summary: [], scannedRows: rowCount };
}

let detector: PIIDetector = (_columns, rows) => emptyResult(rows.length);

export function registerPIIDetector(next: PIIDetector): void {
    detector = next;
}

export function detectPII(columns: string[], rows: string[][]): PIIDetectionResult {
    return detector(columns, rows);
}
