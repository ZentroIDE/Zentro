// SPDX-License-Identifier: GPL-3.0-only

export interface PIIDetectionMatch {
    type: string;
    sample?: string;
    rowIndex: number;
    columnIndex: number;
}

export interface PIIColumnFinding {
    column: string;
    columnIndex: number;
    detectedTypes: string[];
    matches: PIIDetectionMatch[];
}

export interface PIIDetectionResult {
    hasPII: boolean;
    columns: PIIColumnFinding[];
    summary: string[];
    scannedRows: number;
}
