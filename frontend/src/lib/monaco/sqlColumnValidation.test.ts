// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { findUnknownColumns, type ColumnValidationEnv } from './sqlColumnValidation';

const catalog = [{ Name: 'dbo', Tables: ['Employee', 'Department'], Views: [] }];
const columnsByTable: Record<string, string[]> = {
    Employee: ['RowID', 'No_', 'First Name', 'Last Name', 'Contact Person', 'Phone No_', 'DeptId'],
    Department: ['Id', 'Name'],
};

const makeEnv = (overrides: Partial<ColumnValidationEnv> = {}): ColumnValidationEnv => ({
    schemas: catalog,
    currentSchema: 'dbo',
    driver: 'sqlserver',
    fetchColumns: async (_schema, table) => (columnsByTable[table] ?? []).map(Name => ({ Name })),
    ...overrides,
});

const unknownNames = async (sql: string, env = makeEnv()) =>
    (await findUnknownColumns(sql, env)).map(warning =>
        warning.qualifier ? `${warning.qualifier}.${warning.columnName}` : warning.columnName,
    );

describe('findUnknownColumns', () => {
    it('flags the column from the reported case and suggests the right one', async () => {
        const sql =
            'SELECT RowID,\n    No_\n    , [Contact Persod],\n    [Phone No_] FROM Employee e;';
        const [warning] = await findUnknownColumns(sql, makeEnv());

        expect(warning.columnName).toBe('Contact Persod');
        expect(warning.quoted).toBe(true);
        expect(sql.slice(warning.startOffset, warning.endOffset)).toBe('[Contact Persod]');
        expect(warning.suggestions).toEqual(['Contact Person']);
        expect(warning.message).toContain('Did you mean "Contact Person"?');
        expect(warning.tables).toEqual([{ schemaName: 'dbo', name: 'Employee' }]);
    });

    it('checks qualified columns against their own table only', async () => {
        const sql =
            'SELECT e.Name, d.Name, e.DeptId FROM Employee e JOIN Department d ON d.Id = e.DeptId';

        expect(await unknownNames(sql)).toEqual(['e.Name']);
    });

    it('accepts a bare column that exists in any joined table', async () => {
        const sql =
            'SELECT Name, [First Name] FROM Employee e JOIN Department d ON d.Id = e.DeptId';

        expect(await unknownNames(sql)).toEqual([]);
    });

    it('flags a bare column that exists in none of the tables', async () => {
        const sql = 'SELECT Salary FROM Employee e JOIN Department d ON d.Id = e.DeptId';
        const [warning] = await findUnknownColumns(sql, makeEnv());

        expect(warning.message).toContain('any table in this query');
        expect(warning.suggestions).toEqual([]);
        expect(warning.tables).toEqual([
            { schemaName: 'dbo', name: 'Employee' },
            { schemaName: 'dbo', name: 'Department' },
        ]);
    });

    it('compares names case-insensitively and ignores quoting', async () => {
        expect(await unknownNames('SELECT [first name], LASTNAME2 FROM Employee')).toEqual([
            'LASTNAME2',
        ]);
        expect(
            await unknownNames(
                'SELECT "first name" FROM Employee',
                makeEnv({ driver: 'postgres' }),
            ),
        ).toEqual([]);
    });

    it('keeps offsets correct across several statements', async () => {
        const sql = 'SELECT Name FROM Department;\n\nSELECT Nme FROM Department;';
        const [warning] = await findUnknownColumns(sql, makeEnv());

        expect(sql.slice(warning.startOffset, warning.endOffset)).toBe('Nme');
        expect(warning.suggestions).toEqual(['Name']);
    });

    it('does not judge a qualifier that is not a source of the statement', async () => {
        expect(await unknownNames('SELECT dbo.Employee.Salary, x.Salary FROM Employee e')).toEqual(
            [],
        );
    });

    it('ignores functions, aliases, keywords and literals', async () => {
        const sql =
            "SELECT COUNT(*) AS cnt, Name total, 'x' label, CAST(Id AS INT) FROM Department ORDER BY cnt, total";

        expect(await unknownNames(sql)).toEqual([]);
    });

    describe('stays silent when it cannot be sure', () => {
        it.each([
            ['unknown table', 'SELECT Salary FROM Missing m'],
            [
                'one of several tables unknown',
                'SELECT Salary FROM Employee e JOIN Missing m ON 1 = 1',
            ],
            ['CTE', 'WITH x AS (SELECT 1 AS n) SELECT Salary FROM x'],
            ['derived table', 'SELECT Salary FROM (SELECT Id FROM Department) d'],
            ['UNION', 'SELECT Salary FROM Employee UNION SELECT Id FROM Department'],
            ['no FROM', 'SELECT Salary'],
            ['not a SELECT', 'UPDATE Employee SET Salary = 1'],
            ['unbalanced parenthesis', 'SELECT Salary FROM Employee WHERE (Id = 1'],
        ])('%s', async (_label, sql) => {
            expect(await unknownNames(sql)).toEqual([]);
        });

        it('when the table columns cannot be loaded', async () => {
            const failing = makeEnv({
                fetchColumns: async () => {
                    throw new Error('connection lost');
                },
            });

            expect(await unknownNames('SELECT Salary FROM Employee', failing)).toEqual([]);
        });

        it('when the table has no columns', async () => {
            const empty = makeEnv({ fetchColumns: async () => [] });

            expect(await unknownNames('SELECT Salary FROM Employee', empty)).toEqual([]);
        });

        it('for an unsupported driver', async () => {
            expect(
                await unknownNames('SELECT Salary FROM Employee', makeEnv({ driver: '' })),
            ).toEqual([]);
        });
    });

    it('returns nothing once the request is aborted while columns were loading', async () => {
        let aborted = false;
        const result = await findUnknownColumns(
            'SELECT Salary FROM Employee',
            makeEnv({
                fetchColumns: async () => {
                    aborted = true;
                    return [{ Name: 'Id' }];
                },
            }),
            () => aborted,
        );

        expect(result).toEqual([]);
    });
});

describe('findUnknownColumns: suggestions from the schema', () => {
    const orderColumns = [
        'order_id',
        'customer_id',
        'ship_via',
        'freight',
        'ship_address',
        'ship_city',
        'ship_region',
        'ship_country',
    ];
    const orderEnv = () =>
        makeEnv({
            schemas: [{ Name: 'public', Tables: ['orders'], Views: [] }],
            currentSchema: 'public',
            driver: 'postgres',
            fetchColumns: async () => orderColumns.map(Name => ({ Name })),
        });

    it('suggests up to three schema columns that start with the unfinished name', async () => {
        const [warning] = await findUnknownColumns('SELECT order_id, shi FROM orders', orderEnv());

        expect(warning.suggestions).toEqual(['ship_via', 'ship_address', 'ship_city']);
        expect(warning.message).toContain('Matching columns: ship_via, ship_address, ship_city.');
    });

    it('leaves out columns the SELECT list already contains', async () => {
        const sql = 'SELECT ship_via\n    , ship_city\n    , shi\nFROM orders';
        const [warning] = await findUnknownColumns(sql, orderEnv());

        expect(warning.suggestions).toEqual(['ship_address', 'ship_region', 'ship_country']);
    });

    it('treats an alias-qualified selection as selected for that table only', async () => {
        const env = makeEnv({
            fetchColumns: async () => ['Name', 'Nickname'].map(Name => ({ Name })),
        });
        const sql = 'SELECT e.Name, e.Nic, d.Name FROM Employee e JOIN Department d ON 1 = 1';
        const warnings = await findUnknownColumns(sql, env);

        expect(warnings.map(warning => warning.suggestions)).toEqual([['Nickname']]);
    });

    it('does not remove a column that is only used in WHERE or ORDER BY', async () => {
        const sql = 'SELECT shi FROM orders WHERE ship_city = 1 ORDER BY ship_via';
        const [warning] = await findUnknownColumns(sql, orderEnv());

        expect(warning.suggestions).toEqual(['ship_via', 'ship_address', 'ship_city']);
    });

    it('does not suggest the same column back for a typo of a column already selected', async () => {
        const sql = 'SELECT ship_city, ship_ctiy FROM orders';
        const [warning] = await findUnknownColumns(sql, orderEnv());

        expect(warning.suggestions).not.toContain('ship_city');
    });

    it('keeps "Did you mean" for a plain typo', async () => {
        const [warning] = await findUnknownColumns('SELECT frieght FROM orders', orderEnv());

        expect(warning.suggestions[0]).toBe('freight');
        expect(warning.message).toContain('Did you mean "freight"?');
    });
});

describe('findUnknownColumns: ambiguous columns', () => {
    const catalog = [
        { Name: 'public', Tables: ['orders', 'order_details', 'customers'], Views: [] },
    ];
    const columnsByName: Record<string, string[]> = {
        orders: ['order_id', 'customer_id', 'order_date'],
        order_details: ['order_id', 'product_id', 'unit_price'],
        customers: ['customer_id', 'name'],
    };
    const joinEnv = () =>
        makeEnv({
            schemas: catalog,
            currentSchema: 'public',
            driver: 'postgres',
            fetchColumns: async (_schema, table) =>
                (columnsByName[table] ?? []).map(Name => ({ Name })),
        });
    const join = 'FROM orders o INNER JOIN order_details od ON o.order_id = od.order_id';
    const kindsOf = async (sql: string) =>
        (await findUnknownColumns(sql, joinEnv())).map(warning => warning.kind);

    it('reports a bare column that two joined tables both have, as an error', async () => {
        const sql = `SELECT order_id, unit_price ${join}`;
        const [warning] = await findUnknownColumns(sql, joinEnv());

        expect(warning.kind).toBe('ambiguous');
        expect(warning.severity).toBe('error');
        expect(sql.slice(warning.startOffset, warning.endOffset)).toBe('order_id');
        expect(warning.qualifiers).toEqual(['o', 'od']);
        expect(warning.message).toBe(
            'Column reference "order_id" is ambiguous: it exists in orders (o), order_details (od). Qualify it with a table alias, for example o.order_id.',
        );
        expect(warning.shortMessage).toBe(
            'Column "order_id" is ambiguous: orders (o), order_details (od)',
        );
    });

    it('does not report qualified references or columns only one table has', async () => {
        expect(
            await kindsOf(`SELECT o.order_id, od.order_id, unit_price, order_date ${join}`),
        ).toEqual([]);
    });

    it('reports an ambiguous column in WHERE and after ON, wherever it is bare', async () => {
        expect(await kindsOf(`SELECT o.order_date ${join} WHERE order_id > 1`)).toEqual([
            'ambiguous',
        ]);
        expect(
            await kindsOf(
                'SELECT o.order_date FROM orders o JOIN order_details od ON order_id = 1',
            ),
        ).toEqual(['ambiguous']);
    });

    it('reports every occurrence separately', async () => {
        expect(await kindsOf(`SELECT order_id ${join} WHERE order_id > 1`)).toEqual([
            'ambiguous',
            'ambiguous',
        ]);
    });

    it('accepts ORDER BY / GROUP BY / HAVING of a name the SELECT already lists', async () => {
        const sql = `SELECT o.order_id, COUNT(*) AS n ${join} GROUP BY order_id HAVING order_id > 0 ORDER BY order_id`;

        expect(await kindsOf(sql)).toEqual([]);
    });

    it('still reports ORDER BY when the SELECT does not list that name', async () => {
        expect(await kindsOf(`SELECT o.order_date ${join} ORDER BY order_id`)).toEqual([
            'ambiguous',
        ]);
    });

    it('accepts a SELECT alias reused in ORDER BY', async () => {
        expect(await kindsOf(`SELECT o.order_id AS order_id ${join} ORDER BY order_id`)).toEqual(
            [],
        );
    });

    it('reports a self join that repeats every column', async () => {
        const sql = 'SELECT order_id FROM orders a JOIN orders b ON a.order_id = b.order_id';
        const [warning] = await findUnknownColumns(sql, joinEnv());

        expect(warning.qualifiers).toEqual(['a', 'b']);
    });

    it('lists both tables that have the column when a third does not', async () => {
        const sql =
            'SELECT customer_id FROM orders o JOIN customers c ON 1 = 1 JOIN order_details od ON 1 = 1';
        const [warning] = await findUnknownColumns(sql, joinEnv());

        expect(warning.qualifiers).toEqual(['o', 'c']);
    });

    it('says nothing for NATURAL JOIN or USING, where the name is shared on purpose', async () => {
        expect(await kindsOf('SELECT order_id FROM orders NATURAL JOIN order_details')).toEqual([]);
        expect(
            await kindsOf('SELECT order_id FROM orders JOIN order_details USING (order_id)'),
        ).toEqual([]);
    });

    it('does not turn a single-table query into an ambiguity', async () => {
        expect(await kindsOf('SELECT order_id FROM orders')).toEqual([]);
    });
});
