// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { models } from '../../wailsjs/go/models';

export interface RowDetail {
    columns: string[];
    columnTypes?: string[];
    columnDefs?: models.ColumnDef[];
    row: Array<string | null | undefined>;
    tableName?: string;
    primaryKeys?: string[];
    /** Indexes (into `columns`) of columns the result grid currently blurs. */
    blurredColumnIndexes?: ReadonlySet<number>;
    onSave?: (colIdx: number, newVal: string) => void;
}

interface RowDetailState {
    detail: RowDetail | null;
    openDetail: (detail: RowDetail) => void;
    clearDetail: () => void;
}

export const useRowDetailStore = create<RowDetailState>(set => ({
    detail: null,
    openDetail: detail => set({ detail }),
    clearDetail: () => set({ detail: null }),
}));
