// SPDX-License-Identifier: GPL-3.0-only

import { models } from '../../../../wailsjs/go/models';

export function getEditableColumnType(column: models.ColumnDef): string {
    return column.FullDataType?.trim() || column.DataType;
}

export function withEditableColumnType(
    column: models.ColumnDef,
    nextType?: string | null,
): models.ColumnDef {
    const normalizedType =
        typeof nextType === 'string' && nextType.trim().length > 0
            ? nextType.trim()
            : getEditableColumnType(column);

    return {
        ...column,
        DataType: normalizedType,
        FullDataType: normalizedType,
    };
}
