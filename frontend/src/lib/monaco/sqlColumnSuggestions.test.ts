// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { suggestColumnNames } from './sqlColumnSuggestions';

const employeeColumns = ['RowID', 'No_', 'First Name', 'Last Name', 'Contact Person', 'Phone No_'];
const orderColumns = [
    'order_id',
    'customer_id',
    'ship_via',
    'freight',
    'ship_name',
    'ship_address',
    'ship_city',
    'ship_region',
    'ship_postal_code',
    'ship_country',
];

const names = (unknown: string, candidates: string[]) =>
    suggestColumnNames(unknown, candidates).map(suggestion => suggestion.name);

describe('suggestColumnNames: typos', () => {
    it('finds a typo of a multi-word column', () => {
        expect(suggestColumnNames('Contact Persod', employeeColumns)).toEqual([
            { name: 'Contact Person', match: 'similar' },
        ]);
    });

    it('ignores case, spaces and punctuation when comparing', () => {
        expect(names('first_name', employeeColumns)).toEqual(['First Name']);
        expect(names('LASTNAME', employeeColumns)).toEqual(['Last Name']);
    });

    it('catches a swapped pair of letters', () => {
        expect(names('Contcat Person', employeeColumns)).toEqual(['Contact Person']);
    });

    it('catches a missing or extra letter in a short name', () => {
        expect(names('Rowid', ['RowID', 'Name'])).toEqual(['RowID']);
        expect(names('Nam', ['Name', 'Id'])).toEqual(['Name']);
        expect(names('Namee', ['Name', 'Id'])).toEqual(['Name']);
    });

    it('handles non-ASCII names', () => {
        expect(names('Số điện thoai', ['Số điện thoại', 'Tên'])).toEqual(['Số điện thoại']);
    });
});

describe('suggestColumnNames: unfinished names', () => {
    it('offers columns that start with what was typed, in table order', () => {
        expect(suggestColumnNames('shi', orderColumns)).toEqual([
            { name: 'ship_via', match: 'prefix' },
            { name: 'ship_name', match: 'prefix' },
            { name: 'ship_address', match: 'prefix' },
        ]);
    });

    it('offers columns that merely contain the text after those that start with it', () => {
        expect(suggestColumnNames('addr', ['home_address', 'address_line', 'city'])).toEqual([
            { name: 'address_line', match: 'prefix' },
            { name: 'home_address', match: 'contains' },
        ]);
    });

    it('puts a likely typo before a mere prefix match', () => {
        expect(suggestColumnNames('Nam', ['Names', 'Name'])).toEqual([
            { name: 'Name', match: 'similar' },
            { name: 'Names', match: 'prefix' },
        ]);
        expect(suggestColumnNames('ship_cit', ['ship_city', 'city_name'])[0]).toEqual({
            name: 'ship_city',
            match: 'similar',
        });
    });

    it('does not match a single typed letter against half the table', () => {
        expect(names('s', orderColumns)).toEqual([]);
    });
});

describe('suggestColumnNames: limits', () => {
    it('returns at most three names and never repeats one', () => {
        const result = names('ship', [...orderColumns, 'ship_city']);

        expect(result).toHaveLength(3);
        expect(new Set(result).size).toBe(3);
    });

    it('does not offer a far-fetched guess', () => {
        expect(names('Salary', employeeColumns)).toEqual([]);
        expect(names('x', employeeColumns)).toEqual([]);
    });

    it('returns nothing for an empty name or no candidates', () => {
        expect(names('', employeeColumns)).toEqual([]);
        expect(names('___', employeeColumns)).toEqual([]);
        expect(names('Name', [])).toEqual([]);
    });

    it('does not repeat a candidate that appears twice', () => {
        expect(names('Nam', ['Name', 'Name'])).toEqual(['Name']);
    });
});
