// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { TabResult } from '../../../stores/resultStore';
import type { FocusCellRequest } from '../../../features/editor/useResultEditing';

interface UseSearchHitsOptions {
    result?: TabResult;
    quickFilter: string;
    setFocusCellRequest: (req: FocusCellRequest | null) => void;
}

interface UseSearchHitsReturn {
    searchHits: number[];
    activeSearchHit: number;
    jumpToPersistedRow: (rowIndex: number) => void;
    jumpToNextHit: () => void;
    jumpToPrevHit: () => void;
}

export function useSearchHits({
    result,
    quickFilter,
    setFocusCellRequest,
}: UseSearchHitsOptions): UseSearchHitsReturn {
    const [activeSearchHit, setActiveSearchHit] = React.useState(0);

    const searchHits = React.useMemo(() => {
        if (!result || !quickFilter.trim()) return [];
        const query = quickFilter.trim().toLowerCase();
        const hits: number[] = [];
        result.rows.forEach((row, index) => {
            if (row.some(cell => (cell || '').toLowerCase().includes(query))) {
                hits.push(index);
            }
        });
        return hits;
    }, [quickFilter, result]);

    const jumpToPersistedRow = React.useCallback(
        (rowIndex: number) => {
            if (!result || rowIndex < 0 || rowIndex >= result.rows.length) return;
            setFocusCellRequest({
                rowKey: `p:${rowIndex}`,
                colIdx: 0,
                nonce: Date.now(),
            });
        },
        [result, setFocusCellRequest],
    );

    const jumpToNextHit = React.useCallback(() => {
        if (searchHits.length === 0) return;
        const next = (activeSearchHit + 1) % searchHits.length;
        setActiveSearchHit(next);
        jumpToPersistedRow(searchHits[next]);
    }, [activeSearchHit, jumpToPersistedRow, searchHits]);

    const jumpToPrevHit = React.useCallback(() => {
        if (searchHits.length === 0) return;
        const next = (activeSearchHit - 1 + searchHits.length) % searchHits.length;
        setActiveSearchHit(next);
        jumpToPersistedRow(searchHits[next]);
    }, [activeSearchHit, jumpToPersistedRow, searchHits]);

    React.useEffect(() => {
        setActiveSearchHit(0);
    }, [quickFilter, result?.lastExecutedQuery]);

    return {
        searchHits,
        activeSearchHit,
        jumpToPersistedRow,
        jumpToNextHit,
        jumpToPrevHit,
    };
}
