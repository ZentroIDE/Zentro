// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';

export function useDataTableViewStats(
    visibleRows: number,
    totalRows: number,
    onViewStatsChange?: (stats: { visibleRows: number; totalRows: number }) => void,
) {
    const callbackRef = useRef(onViewStatsChange);
    const lastStatsRef = useRef<{ visibleRows: number; totalRows: number } | null>(null);

    useEffect(() => {
        callbackRef.current = onViewStatsChange;
    }, [onViewStatsChange]);

    useEffect(() => {
        const nextStats = { visibleRows, totalRows };
        const previousStats = lastStatsRef.current;

        if (
            previousStats?.visibleRows === nextStats.visibleRows &&
            previousStats?.totalRows === nextStats.totalRows
        ) {
            return;
        }

        lastStatsRef.current = nextStats;
        callbackRef.current?.(nextStats);
    }, [totalRows, visibleRows]);
}
