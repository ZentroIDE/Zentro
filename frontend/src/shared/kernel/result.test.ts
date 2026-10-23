// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { fail, ok, unwrapOrThrow } from './result';

describe('unwrapOrThrow', () => {
    it('returns the data of a successful result', () => {
        expect(unwrapOrThrow(ok(42))).toBe(42);
    });

    it('throws an Error carrying the KernelError message on failure', () => {
        expect(() => unwrapOrThrow(fail({ code: 'thing.failed', message: 'boom' }))).toThrow(
            'boom',
        );
    });

    it('prefers the original error text (context.cause) over the generic message', () => {
        expect(() =>
            unwrapOrThrow(
                fail({
                    code: 'thing.failed',
                    message: 'Failed to do thing',
                    context: { cause: 'not a git repository' },
                }),
            ),
        ).toThrow('not a git repository');
    });
});
