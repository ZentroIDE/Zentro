// SPDX-License-Identifier: GPL-3.0-only

import { matrixToCsv } from '../../../../lib/csv';
import {
    buildRowAsUpdateStatement,
    buildRowsAsInsertStatements,
    buildSelectionMatrix,
    matrixToTsv,
    type SqlLiteralColumnMap,
} from '../../../../features/editor/resultSelectionActions';

export function buildCopyMatrix(args: {
    selectedCells: Set<string>;
    displayRows: Parameters<typeof buildSelectionMatrix>[0]['displayRows'];
    rowOrder: Parameters<typeof buildSelectionMatrix>[0]['rowOrder'];
    editedCells: Parameters<typeof buildSelectionMatrix>[0]['editedCells'];
}) {
    return buildSelectionMatrix(args);
}

export function buildCopyWithHeadersTsv(args: { headers: string[]; matrix: string[][] }): string {
    return matrixToTsv([args.headers, ...args.matrix]);
}

export function buildCopyJson(args: { headers: string[]; matrix: string[][] }): string {
    const jsonRows = args.matrix.map(row => {
        const obj: Record<string, string> = {};
        args.headers.forEach((col, index) => {
            obj[col] = row[index] ?? '';
        });
        return obj;
    });
    return JSON.stringify(jsonRows, null, 2);
}

export function buildCopyCsvWithHeaders(args: { headers: string[]; matrix: string[][] }): string {
    return matrixToCsv([args.headers, ...args.matrix]);
}

export function buildCopyInsertSql(args: {
    selectedCells: Set<string>;
    selectedRowKeys: string[];
    displayRows: Parameters<typeof buildRowsAsInsertStatements>[0]['displayRows'];
    rowOrder: Parameters<typeof buildRowsAsInsertStatements>[0]['rowOrder'];
    editedCells: Parameters<typeof buildRowsAsInsertStatements>[0]['editedCells'];
    columns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    return buildRowsAsInsertStatements(args);
}

export function buildCopyUpdateSql(args: {
    selectedCells: Set<string>;
    displayRows: Parameters<typeof buildRowAsUpdateStatement>[0]['displayRows'];
    rowOrder: Parameters<typeof buildRowAsUpdateStatement>[0]['rowOrder'];
    editedCells: Parameters<typeof buildRowAsUpdateStatement>[0]['editedCells'];
    columns: string[];
    pkColumns: string[];
    tableName: string;
    driver: string | undefined;
    columnTypes?: SqlLiteralColumnMap;
}): string {
    return buildRowAsUpdateStatement(args);
}
