// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { useToast } from '../../../components/layout/Toast';
import { Button, ConfirmDialog, Input, Spinner } from '../../../components/ui';
import type { RowFetchOutcome } from '../resultTable/rowFetchRunner';
import { useResultRowFetcher } from '../resultTable/useResultRowFetcher';
import type { PinnedResultConnection } from './types';

/** Above this many rows (or an unknown total), "Fetch all" asks first: everything fetched stays
 *  in memory and is pulled 100 rows per round trip. */
export const FETCH_ALL_CONFIRM_THRESHOLD = 50_000;
const DEFAULT_FETCH_ROWS = 1000;

interface ResultRowFetchControlsProps {
    tabId: string;
    previewSessionId?: string;
    pinnedConnection?: PinnedResultConnection;
    hasMore: boolean;
    totalCount?: number;
}

export function parseFetchRowCount(raw: string): number | null {
    const value = Number(raw.trim());
    return Number.isInteger(value) && value > 0 ? value : null;
}

export function shouldConfirmFetchAll(totalCount: number | undefined): boolean {
    return totalCount === undefined || totalCount > FETCH_ALL_CONFIRM_THRESHOLD;
}

const ResultRowFetchControlsInner: React.FC<ResultRowFetchControlsProps> = ({
    tabId,
    previewSessionId,
    pinnedConnection,
    hasMore,
    totalCount,
}) => {
    const { toast } = useToast();
    const { isRunning, start, cancel } = useResultRowFetcher({
        tabId,
        previewSessionId,
        pinnedConnection,
    });
    const [rowsInput, setRowsInput] = React.useState(String(DEFAULT_FETCH_ROWS));
    const [confirmingAll, setConfirmingAll] = React.useState(false);
    const rowCount = parseFetchRowCount(rowsInput);

    const report = React.useCallback(
        (outcome: RowFetchOutcome | null) => {
            if (!outcome) return;
            if (outcome.reason === 'cancelled') {
                toast.info(`Fetch cancelled after ${outcome.fetched.toLocaleString()} rows`);
            } else if (outcome.reason === 'error' || outcome.reason === 'stalled') {
                toast.error(`Fetch stopped after ${outcome.fetched.toLocaleString()} rows`);
            }
        },
        [toast],
    );

    const fetchRows = () => {
        if (rowCount === null) return;
        void start(rowCount).then(report);
    };
    const fetchAll = () => {
        if (shouldConfirmFetchAll(totalCount)) {
            setConfirmingAll(true);
            return;
        }
        void start('all').then(report);
    };

    if (!hasMore && !isRunning) return null;

    if (isRunning) {
        return (
            <span className='flex items-center gap-1.5'>
                <Spinner size={11} tone='primary' />
                <span>Fetching rows...</span>
                <Button size='micro' variant='outline' onClick={cancel}>
                    Cancel
                </Button>
            </span>
        );
    }

    return (
        <span className='flex items-center gap-1'>
            <Input
                size='micro'
                inputMode='numeric'
                aria-label='Rows to fetch'
                title='Rows to fetch (fetched in batches of 100)'
                className='w-16 text-right'
                value={rowsInput}
                state={rowCount === null ? 'error' : 'default'}
                onChange={event => setRowsInput(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter') fetchRows();
                }}
            />
            <Button
                size='micro'
                variant='outline'
                disabled={rowCount === null}
                onClick={fetchRows}
                title='Fetch more rows'
            >
                Fetch
            </Button>
            <Button
                size='micro'
                variant='outline'
                onClick={fetchAll}
                title='Fetch every remaining row'
            >
                Fetch all
            </Button>
            <ConfirmDialog
                open={confirmingAll}
                title='Fetch all rows?'
                description={
                    totalCount === undefined
                        ? 'The total row count is not known yet, so this could be very large.'
                        : `This will load about ${totalCount.toLocaleString()} rows.`
                }
                helperText='Every row is kept in memory and loaded 100 at a time. You can cancel while it runs.'
                confirmLabel='Fetch all'
                onCancel={() => setConfirmingAll(false)}
                onConfirm={() => {
                    setConfirmingAll(false);
                    void start('all').then(report);
                }}
            />
        </span>
    );
};

export const ResultRowFetchControls = React.memo(ResultRowFetchControlsInner);
