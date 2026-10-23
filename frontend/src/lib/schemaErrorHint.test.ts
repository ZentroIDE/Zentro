// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { withSchemaContextHint } from './schemaErrorHint';

describe('withSchemaContextHint', () => {
    it('appends schema context for missing unqualified relations', () => {
        const error = 'query: ERROR: relation "accounts" does not exist (SQLSTATE 42P01)';

        expect(withSchemaContextHint(error, 'app', 'select * from accounts')).toContain(
            'Query ran against schema "app".',
        );
    });

    it('does not append schema context for fully-qualified relations', () => {
        const error = 'query: ERROR: relation "accounts" does not exist (SQLSTATE 42P01)';

        expect(withSchemaContextHint(error, 'public', 'select * from billing.accounts')).toBe(
            error,
        );
    });

    it('does not append schema context for unrelated errors', () => {
        const error = 'query: ERROR: syntax error at or near "from" (SQLSTATE 42601)';

        expect(withSchemaContextHint(error, 'public', 'select from accounts')).toBe(error);
    });
});
