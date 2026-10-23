// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { approvalRowCount, approvalTables, formatBytes, readableBody } from './rowApproval';

describe('approvalTables', () => {
    it('reads query rows with their column names', () => {
        const [table] = approvalTables([
            {
                tool: 'run_readonly_query',
                label: 'Ran a query',
                rows: 2,
                content: JSON.stringify({
                    ok: true,
                    data: {
                        columns: [{ name: 'id' }, { name: 'status' }],
                        rows: [
                            ['1', 'ok'],
                            ['2', null],
                        ],
                    },
                }),
            },
        ]);
        expect(table.columns).toEqual(['id', 'status']);
        expect(table.rows).toEqual([
            ['1', 'ok'],
            ['2', ''],
        ]);
        expect(table.raw).toBeUndefined();
    });

    it('reads key samples', () => {
        const [table] = approvalTables([
            {
                tool: 'estimate_impact',
                label: 'Estimate',
                rows: 1,
                content: JSON.stringify({ data: { keySamples: [['7']] } }),
            },
        ]);
        expect(table.columns).toEqual(['key']);
        expect(table.rows).toEqual([['7']]);
    });

    it('shows a result it cannot read as it would be sent', () => {
        const [table] = approvalTables([{ tool: 'x', label: '', rows: 1, content: 'not json' }]);
        expect(table.raw).toBe('not json');
        expect(table.title).toBe('x');
    });

    it('counts rows and formats sizes', () => {
        expect(
            approvalRowCount([
                { tool: 'a', label: '', rows: 2, content: '' },
                { tool: 'b', label: '', rows: 3, content: '' },
            ]),
        ).toBe(5);
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
    });
});

describe('readableBody', () => {
    it('indents a compact JSON body and leaves other text alone', () => {
        expect(readableBody('{"a":1}')).toBe(['{', '  "a": 1', '}'].join('\n'));
        expect(readableBody('not json')).toBe('not json');
    });
});
