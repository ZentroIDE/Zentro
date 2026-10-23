// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getTableInfoDirtySummary } from './tableInfoDirtyState';

describe('getTableInfoDirtySummary', () => {
    it('aggregates dirty sections and the table name draft into a summary', () => {
        const summary = getTableInfoDirtySummary({
            columnsDirtyCount: 2,
            dataDirtyCount: 1,
            keysDirtyCount: 3,
            draftTableNameDirty: true,
        });

        expect(summary.hasChanges).toBe(true);
        expect(summary.totalCount).toBe(7);
        expect(summary.sections.map(section => section.label)).toEqual([
            'Columns',
            'Data',
            'Keys',
            'Table name',
        ]);
        expect(summary.summaryLabel).toContain('Columns');
        expect(summary.summaryLabel).toContain('Data');
        expect(summary.summaryLabel).toContain('Keys');
    });

    it('returns a clean summary when nothing is dirty', () => {
        const summary = getTableInfoDirtySummary({
            columnsDirtyCount: 0,
            dataDirtyCount: 0,
            keysDirtyCount: 0,
            draftTableNameDirty: false,
        });

        expect(summary.hasChanges).toBe(false);
        expect(summary.totalCount).toBe(0);
        expect(summary.sections).toEqual([]);
        expect(summary.summaryLabel).toBe('No unsaved changes');
    });
});
