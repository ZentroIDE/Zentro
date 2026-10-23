// SPDX-License-Identifier: GPL-3.0-only

import { ResultFetchStrategy, ExportStatus } from './enums';

export { ResultFetchStrategy, ExportStatus };

export interface ResultViewportState {
    strategy: ResultFetchStrategy;
    isLargeDataset: boolean;
    rowCount: number;
    hasMore: boolean;
}

export interface ExportJobStatus {
    id: string;
    label?: string;
    status: ExportStatus;
    startedAt: number;
    finishedAt?: number;
    processedRows?: number;
    totalRows?: number;
    progressPct?: number;
    queuedCount?: number;
    error?: string;
}

const INCREMENTAL_THRESHOLD = 15000;

export function resolveResultFetchStrategy(
    rowCount: number,
    hasMore: boolean,
    isDone: boolean,
): ResultViewportState {
    if (!isDone) {
        return {
            strategy: ResultFetchStrategy.SERVER_AWARE,
            isLargeDataset: false,
            rowCount,
            hasMore,
        };
    }
    if (hasMore) {
        return {
            strategy: ResultFetchStrategy.SERVER_AWARE,
            isLargeDataset: true,
            rowCount,
            hasMore,
        };
    }
    if (rowCount >= INCREMENTAL_THRESHOLD) {
        return {
            strategy: ResultFetchStrategy.INCREMENTAL_CLIENT,
            isLargeDataset: true,
            rowCount,
            hasMore,
        };
    }
    return {
        strategy: ResultFetchStrategy.CLIENT_FULL,
        isLargeDataset: false,
        rowCount,
        hasMore,
    };
}
