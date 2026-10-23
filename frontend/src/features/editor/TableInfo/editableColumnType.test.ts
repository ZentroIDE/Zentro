// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getEditableColumnType, withEditableColumnType } from './editableColumnType';

describe('editableColumnType', () => {
    it('prefers full data type when available', () => {
        expect(
            getEditableColumnType({
                Name: 'email',
                DataType: 'character varying',
                FullDataType: 'varchar(255)',
            } as any),
        ).toBe('varchar(255)');
    });

    it('falls back to generic data type when full data type is absent', () => {
        expect(
            getEditableColumnType({
                Name: 'active',
                DataType: 'boolean',
                FullDataType: '',
            } as any),
        ).toBe('boolean');
    });

    it('syncs editable type back into both data type fields', () => {
        expect(
            withEditableColumnType(
                {
                    Name: 'amount',
                    DataType: 'numeric',
                    FullDataType: 'numeric(10,2)',
                } as any,
                'decimal(12,4)',
            ),
        ).toMatchObject({
            DataType: 'decimal(12,4)',
            FullDataType: 'decimal(12,4)',
        });
    });
});
