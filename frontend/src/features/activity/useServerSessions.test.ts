// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';
import { useServerSessions } from './useServerSessions';

function makeSession(overrides: Partial<ServerSession> = {}): ServerSession {
    return {
        id: '100',
        user: 'app',
        database: 'shop',
        client: '10.0.0.1:5432',
        state: 'active',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        wait: '',
        query: 'SELECT 1',
        isSelf: false,
        ...overrides,
    };
}

function installGateway(list: ReturnType<typeof vi.fn>) {
    setApiGateway({
        serverSession: { list },
    } as unknown as ApiGateway);
}

describe('useServerSessions', () => {
    beforeEach(() => {
        // shouldAdvanceTime keeps real wall-clock progress alongside the
        // faked setInterval, so testing-library's setTimeout-polling
        // waitFor still resolves while advanceTimersByTimeAsync drives the
        // poll interval itself.
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        resetApiGateway();
        vi.useRealTimers();
    });

    it('fetches immediately once enabled, and polls on the interval', async () => {
        const list = vi.fn(async () => ({ ok: true as const, data: [makeSession()] }));
        installGateway(list);

        const { result } = renderHook(() => useServerSessions(true, 5000));

        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.sessions).toHaveLength(1));
        expect(result.current.supported).toBe(true);

        await vi.advanceTimersByTimeAsync(5000);
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('does not poll while disabled', async () => {
        const list = vi.fn(async () => ({ ok: true as const, data: [] }));
        installGateway(list);

        renderHook(() => useServerSessions(false, 5000));

        await vi.advanceTimersByTimeAsync(20000);
        expect(list).not.toHaveBeenCalled();
    });

    it('marks supported=false when the driver has no SessionMonitor port', async () => {
        const list = vi.fn(async () => ({
            ok: false as const,
            error: {
                code: 'serverSession.list.failed',
                message: 'server session listing is not supported for this driver',
            },
        }));
        installGateway(list);

        const { result } = renderHook(() => useServerSessions(true, 5000));

        await waitFor(() => expect(result.current.supported).toBe(false));
        expect(result.current.error).toMatch(/not supported/i);
    });

    it('keeps supported=true for a transient fetch error', async () => {
        const list = vi.fn(async () => ({
            ok: false as const,
            error: { code: 'serverSession.list.failed', message: 'connection reset' },
        }));
        installGateway(list);

        const { result } = renderHook(() => useServerSessions(true, 5000));

        await waitFor(() => expect(result.current.error).toBe('connection reset'));
        expect(result.current.supported).toBe(true);
    });
});
