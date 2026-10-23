// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    extractMentions,
    findMentionQuery,
    insertMention,
    mentionCandidates,
    parseMentionQuery,
} from './mention';

const catalog = {
    schema: 'public',
    tables: [{ name: 'orders', columns: ['id', 'status'] }],
};

describe('mention helpers', () => {
    it('finds the @word under the caret only', () => {
        expect(findMentionQuery('count @ord', 10)).toEqual({ start: 6, query: 'ord' });
        expect(findMentionQuery('mail a@b', 8)).toBeNull();
    });

    it('inserts the chosen name and moves the caret after it', () => {
        const found = findMentionQuery('check @ord', 10)!;
        expect(insertMention('check @ord', found, 10, 'orders.status')).toEqual({
            text: 'check @orders.status ',
            caret: 21,
        });
    });

    it('lists tables and columns from the active catalog', () => {
        expect(mentionCandidates(catalog, 'status').map(item => item.value)).toEqual([
            'orders.status',
        ]);
    });

    it('keeps only names that exist in the catalog', () => {
        expect(extractMentions('use @orders.status and @prod_users', catalog)).toEqual([
            'orders.status',
        ]);
    });
});

describe('mention kinds', () => {
    it('tags each candidate with its kind and lists the schema first', () => {
        const withSchema = { ...catalog, schema: 'public' };
        const items = mentionCandidates(withSchema, '');
        expect(items[0]).toEqual({ label: 'public', value: 'public', kind: 'schema' });
        expect(items.find(item => item.value === 'orders')?.kind).toBe('table');
        expect(items.find(item => item.value === 'orders.status')?.kind).toBe('column');
    });
});

describe('mention shortcuts', () => {
    it('reads the kind from the prefix', () => {
        expect(parseMentionQuery('t:ord')).toEqual({ kind: 'table', text: 'ord' });
        expect(parseMentionQuery('S:pub')).toEqual({ kind: 'schema', text: 'pub' });
        expect(parseMentionQuery('ord')).toEqual({ kind: null, text: 'ord' });
    });

    it('lists only tables after @t:', () => {
        const items = mentionCandidates({ ...catalog, schema: 'public' }, 't:');
        expect(items.map(item => item.kind)).toEqual(['table']);
    });

    it('lists nothing yet for the query-file shortcut', () => {
        expect(mentionCandidates(catalog, 'q:')).toEqual([]);
    });

    it('keeps a prefixed name when the message is sent', () => {
        expect(extractMentions('check @t:orders', catalog)).toEqual(['orders']);
    });
});
