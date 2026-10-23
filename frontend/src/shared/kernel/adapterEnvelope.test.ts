// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { withKernelResult } from './adapterEnvelope';

describe('withKernelResult', () => {
    it('wraps a successful call in an ok KernelResult', async () => {
        const adapter = { getThing: vi.fn().mockResolvedValue(42) };
        const wrapped = withKernelResult('thing', adapter);

        await expect(wrapped.getThing()).resolves.toEqual({ ok: true, data: 42 });
    });

    it('wraps a rejected call in a fail KernelResult with a domain-scoped error code', async () => {
        const adapter = { getThing: vi.fn().mockRejectedValue(new Error('boom')) };
        const wrapped = withKernelResult('thing', adapter);

        await expect(wrapped.getThing()).resolves.toMatchObject({
            ok: false,
            error: {
                code: 'thing.getThing.failed',
                context: { cause: 'boom' },
            },
        });
    });

    it('forwards call arguments to the wrapped method', async () => {
        const adapter = { saveThing: vi.fn().mockResolvedValue(undefined) };
        const wrapped = withKernelResult('thing', adapter);

        await wrapped.saveThing('a', 2);

        expect(adapter.saveThing).toHaveBeenCalledWith('a', 2);
    });

    it('leaves undefined (optional) methods undefined instead of wrapping them', () => {
        const adapter: { getThing?: () => Promise<number> } = {};
        const wrapped = withKernelResult('thing', adapter);

        expect(wrapped.getThing).toBeUndefined();
    });

    it('wraps only the methods that are present on an object with optional methods', async () => {
        const adapter: { getThing?: () => Promise<number>; saveThing?: () => Promise<void> } = {
            getThing: vi.fn().mockResolvedValue(7),
        };
        const wrapped = withKernelResult('thing', adapter);

        expect(wrapped.saveThing).toBeUndefined();
        await expect(wrapped.getThing?.()).resolves.toEqual({ ok: true, data: 7 });
    });
});
