// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { buildCompletionPlan, type SqlCompletionServices } from './sqlCompletionEngineCore';
import { createEmptyCompletionMemory } from './sqlCompletionMemory';

const catalogSnapshot = [
    { Name: 'dbo', Tables: ['Customer', 'Orders', 'Items', 'Region'], Views: [] },
];

// Orders.CustomerId -> Customer.Id and Items.OrderId -> Orders.Id
const relationships = [
    {
        ConstraintName: 'FK_Orders_Customer',
        SourceSchema: 'dbo',
        SourceTable: 'Orders',
        SourceColumn: 'CustomerId',
        TargetSchema: 'dbo',
        TargetTable: 'Customer',
        TargetColumn: 'Id',
    },
    {
        ConstraintName: 'FK_Items_Orders',
        SourceSchema: 'dbo',
        SourceTable: 'Items',
        SourceColumn: 'OrderId',
        TargetSchema: 'dbo',
        TargetTable: 'Orders',
        TargetColumn: 'Id',
    },
];

const columnsByTable: Record<string, string[]> = {
    Customer: ['Id', 'Name', 'OrderNote'],
    Orders: ['Id', 'CustomerId', 'OrderDate'],
    Items: ['Id', 'OrderId', 'Sku'],
};

const services: SqlCompletionServices = {
    fetchColumns: async (_schema, table) => (columnsByTable[table] ?? []).map(Name => ({ Name })),
    fetchRelationships: async (_schema, table) =>
        relationships.filter(
            relationship =>
                relationship.SourceTable === table || relationship.TargetTable === table,
        ),
};

/** Position of `offset` in `text` (1-based line and column), like Monaco's model. */
const positionIn = (text: string) => (offset: number) => {
    const before = text.slice(0, offset).split('\n');
    return { lineNumber: before.length, column: before[before.length - 1].length + 1 };
};

/** Runs completion at the "|" marker of `sqlWithCursor`. */
async function complete(
    sqlWithCursor: string,
    overrides: { services?: SqlCompletionServices; withPositionAt?: boolean } = {},
) {
    const cursorOffset = sqlWithCursor.indexOf('|');
    const sqlText = sqlWithCursor.replace('|', '');
    const currentWord = /[\w]*$/.exec(sqlText.slice(0, cursorOffset))?.[0] ?? '';
    const before = sqlText.slice(0, cursorOffset).split('\n');
    const line = before.length;
    const result = await buildCompletionPlan(
        {
            sqlText,
            cursorOffset,
            currentWord,
            range: {
                startLineNumber: line,
                endLineNumber: line,
                startColumn: before[line - 1].length + 1 - currentWord.length,
                endColumn: before[line - 1].length + 1,
            },
            positionAt: overrides.withPositionAt === false ? undefined : positionIn(sqlText),
            editorFlavor: 'main',
            driver: 'sqlserver',
            currentSchema: 'dbo',
            catalogSnapshot,
            templates: [],
        },
        overrides.services ?? services,
        createEmptyCompletionMemory(),
    );
    return { sqlText, candidates: result.candidates };
}

const fkItems = (candidates: Awaited<ReturnType<typeof complete>>['candidates']) =>
    candidates.filter(candidate => candidate.item.additionalTextEdits?.length);

/** Applies the single-line additional edit of an item to `sqlText`. */
function applyJoinEdit(sqlText: string, edit: { range: { startColumn: number }; text: string }) {
    const at = edit.range.startColumn - 1;
    return `${sqlText.slice(0, at)}${edit.text}${sqlText.slice(at)}`;
}

describe('foreign key column suggestions', () => {
    it('offers a related table column together with the JOIN it needs', async () => {
        const { sqlText, candidates } = await complete('SELECT ord| FROM Customer c');

        const item = fkItems(candidates).find(candidate => candidate.label === 'o.OrderDate');
        expect(item?.item.insertText).toBe('o.OrderDate');
        expect(item?.item.detail).toBe('Orders via FK_Orders_Customer');
        expect(
            String(
                item?.item.documentation && (item.item.documentation as { value: string }).value,
            ),
        ).toContain('LEFT JOIN dbo.Orders o ON c.Id = o.CustomerId');
        expect(applyJoinEdit(sqlText, item!.item.additionalTextEdits![0])).toBe(
            'SELECT ord FROM Customer c\nLEFT JOIN dbo.Orders o ON c.Id = o.CustomerId',
        );
    });

    it('places the JOIN after the FROM clause, before WHERE / ORDER BY', async () => {
        const { sqlText, candidates } = await complete(
            'SELECT ord| FROM Customer c WHERE c.Id = 1 ORDER BY c.Id',
        );

        const item = fkItems(candidates).find(candidate => candidate.label === 'o.OrderDate');

        expect(applyJoinEdit(sqlText, item!.item.additionalTextEdits![0])).toBe(
            'SELECT ord FROM Customer c\nLEFT JOIN dbo.Orders o ON c.Id = o.CustomerId WHERE c.Id = 1 ORDER BY c.Id',
        );
    });

    it('goes after existing JOINs and their ON conditions', async () => {
        const { sqlText, candidates } = await complete(
            'SELECT sku| FROM Customer c JOIN Orders o ON o.CustomerId = c.Id WHERE 1 = 1',
        );

        const item = fkItems(candidates).find(candidate => candidate.label === 'i.Sku');

        expect(applyJoinEdit(sqlText, item!.item.additionalTextEdits![0])).toBe(
            'SELECT sku FROM Customer c JOIN Orders o ON o.CustomerId = c.Id\nLEFT JOIN dbo.Items i ON o.Id = i.OrderId WHERE 1 = 1',
        );
    });

    it('indents the JOIN like the FROM line and targets the right line', async () => {
        const { candidates } = await complete('  SELECT ord|\n  FROM Customer c\n  WHERE 1 = 1');

        const edit = fkItems(candidates).find(candidate => candidate.label === 'o.OrderDate')!.item
            .additionalTextEdits![0];

        expect(edit.range.startLineNumber).toBe(2);
        expect(edit.range.startColumn).toBe('  FROM Customer c'.length + 1);
        expect(edit.text).toBe('\n  LEFT JOIN dbo.Orders o ON c.Id = o.CustomerId');
    });

    it('does not offer columns of a table that is already joined', async () => {
        const { candidates } = await complete(
            'SELECT date| FROM Customer c JOIN Orders o ON o.CustomerId = c.Id',
        );

        expect(fkItems(candidates)).toEqual([]);
        expect(candidates.some(candidate => candidate.label === 'o.OrderDate')).toBe(true);
    });

    it('needs at least two typed characters', async () => {
        const { candidates } = await complete('SELECT o| FROM Customer c');

        expect(fkItems(candidates)).toEqual([]);
    });

    it('needs a FROM clause to attach the JOIN to', async () => {
        const { candidates } = await complete('SELECT ord|');

        expect(fkItems(candidates)).toEqual([]);
    });

    it('is off without a way to convert offsets to positions', async () => {
        const { candidates } = await complete('SELECT ord| FROM Customer c', {
            withPositionAt: false,
        });

        expect(fkItems(candidates)).toEqual([]);
    });

    it('is not offered after "alias." or outside the select list', async () => {
        expect(fkItems((await complete('SELECT c.ord| FROM Customer c')).candidates)).toEqual([]);
        expect(fkItems((await complete('SELECT * FROM Customer c WHERE ord|')).candidates)).toEqual(
            [],
        );
    });

    it('picks an alias that is not already taken', async () => {
        const { candidates } = await complete('SELECT ord| FROM Customer o');

        const item = fkItems(candidates).find(candidate => candidate.label === 'o2.OrderDate');
        expect(item?.item.insertText).toBe('o2.OrderDate');
        expect(item?.item.additionalTextEdits?.[0].text).toContain(
            'LEFT JOIN dbo.Orders o2 ON o.Id = o2.CustomerId',
        );
    });

    it('ranks below the columns of the tables already in the query', async () => {
        const { candidates } = await complete('SELECT ord| FROM Customer c');

        const labels = candidates.map(candidate => candidate.label);
        expect(labels.indexOf('OrderNote')).toBeGreaterThanOrEqual(0);
        expect(labels.indexOf('OrderNote')).toBeLessThan(labels.indexOf('o.OrderDate'));
    });

    it('quotes names for the driver', async () => {
        const spacedServices: SqlCompletionServices = {
            ...services,
            fetchColumns: async (_schema, table) =>
                (table === 'Orders' ? ['Order Date'] : (columnsByTable[table] ?? [])).map(Name => ({
                    Name,
                })),
        };

        const { candidates } = await complete('SELECT order| FROM Customer c', {
            services: spacedServices,
        });

        const item = fkItems(candidates).find(candidate => candidate.label === 'o.Order Date');
        expect(item?.item.insertText).toBe('o.[Order Date]');
    });

    it('keeps the regular suggestions when relationships cannot be loaded', async () => {
        const failing: SqlCompletionServices = {
            ...services,
            fetchRelationships: async () => {
                throw new Error('offline');
            },
        };

        const { candidates } = await complete('SELECT na| FROM Customer c', { services: failing });

        expect(candidates.some(candidate => candidate.label === 'Name')).toBe(true);
        expect(fkItems(candidates)).toEqual([]);
    });

    it('skips a second foreign key to the same table instead of guessing', async () => {
        const twoKeys: SqlCompletionServices = {
            ...services,
            fetchRelationships: async (_schema, table) =>
                table === 'Customer'
                    ? [
                          ...relationships.slice(0, 1),
                          { ...relationships[0], ConstraintName: 'FK_Orders_Customer_Alt' },
                      ]
                    : [],
        };

        const { candidates } = await complete('SELECT ord| FROM Customer c', { services: twoKeys });

        const dates = fkItems(candidates).filter(candidate =>
            candidate.label.endsWith('.OrderDate'),
        );
        expect(dates).toHaveLength(1);
    });
});
