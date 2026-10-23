// SPDX-License-Identifier: GPL-3.0-only

import type { RowState } from './types';

const hasRowChanged = (row: RowState) =>
    row.isNew || row.deleted || JSON.stringify(row.original) !== JSON.stringify(row.current);

export const getColumnsDirtyCount = (rows: RowState[]): number =>
    rows.reduce((count, row) => count + (hasRowChanged(row) ? 1 : 0), 0);

export { getDataDirtyCount } from '../../../lib/pendingChanges';
