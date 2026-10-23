// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

const NO_MARKS: ReadonlySet<string> = new Set<string>();

/**
 * Columns the user has marked as image columns for the table currently on
 * screen.
 *
 * Every data cell needs this, and the answer is per column, not per cell. Held
 * in context so the grid subscribes to the store once instead of opening one
 * store subscription per rendered cell — at a few thousand cells on screen that
 * subscription cost lands squarely on the scroll path.
 */
export const MarkedImageColumnsContext = React.createContext<ReadonlySet<string>>(NO_MARKS);

export const EMPTY_IMAGE_COLUMN_MARKS = NO_MARKS;

export function useIsMarkedImageColumn(columnKey: string): boolean {
    return React.useContext(MarkedImageColumnsContext).has(columnKey);
}
