// SPDX-License-Identifier: GPL-3.0-only

export interface TableInfoDirtyStateInput {
    columnsDirtyCount: number;
    dataDirtyCount: number;
    keysDirtyCount: number;
    draftTableNameDirty: boolean;
}

export function getTableInfoDirtySummary({
    columnsDirtyCount,
    dataDirtyCount,
    keysDirtyCount,
    draftTableNameDirty,
}: TableInfoDirtyStateInput) {
    const sections: Array<{ key: string; label: string; count: number }> = [];

    if (columnsDirtyCount > 0) {
        sections.push({ key: 'columns', label: 'Columns', count: columnsDirtyCount });
    }
    if (dataDirtyCount > 0) {
        sections.push({ key: 'data', label: 'Data', count: dataDirtyCount });
    }
    if (keysDirtyCount > 0) {
        sections.push({ key: 'keys', label: 'Keys', count: keysDirtyCount });
    }
    if (draftTableNameDirty) {
        sections.push({ key: 'table-name', label: 'Table name', count: 1 });
    }

    const totalCount =
        columnsDirtyCount + dataDirtyCount + keysDirtyCount + (draftTableNameDirty ? 1 : 0);

    return {
        sections,
        totalCount,
        hasChanges: totalCount > 0,
        summaryLabel:
            sections.length === 0
                ? 'No unsaved changes'
                : sections.length === 1
                  ? `${sections[0].label} has unsaved changes`
                  : `${sections.map(section => section.label).join(', ')} have unsaved changes`,
    };
}
