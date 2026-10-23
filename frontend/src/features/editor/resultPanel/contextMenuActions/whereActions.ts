// SPDX-License-Identifier: GPL-3.0-only

import {
    buildWhereClauseBySelectionIn,
    type SqlLiteralColumnMap,
} from '../../../../features/editor/resultSelectionActions';

export function buildWhereQueryFromSelection(args: {
    selectedCells: Set<string>;
    displayRowsByKey: Parameters<typeof buildWhereClauseBySelectionIn>[0]['displayRowsByKey'];
    editedCells: Parameters<typeof buildWhereClauseBySelectionIn>[0]['editedCells'];
    columns: string[];
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
    buildQueryFromGeneratedWhere: (clause: string) => string;
}): string {
    const clause = buildWhereClauseBySelectionIn({
        selectedCells: args.selectedCells,
        displayRowsByKey: args.displayRowsByKey,
        editedCells: args.editedCells,
        columns: args.columns,
        driver: args.driver,
        columnTypes: args.columnTypes,
    });
    if (!clause) return '';
    return args.buildQueryFromGeneratedWhere(clause);
}
