// SPDX-License-Identifier: GPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONNECTION_STATUS } from '../lib/constants';
import { useConnectionStore } from '../stores/connectionStore';
import { useProjectStore } from '../stores/projectStore';
import { useNoConnectionNotice } from './useNoConnectionNotice';

const SETTLE_MS = 800;

const setProject = (id: string | null, isLoading = false) => {
    useProjectStore.setState({
        activeProject: id ? ({ id } as never) : null,
        isLoading,
    });
};

const setConnection = (status: (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS]) => {
    useConnectionStore.setState({
        connectionStatus: status,
        isConnected: status === CONNECTION_STATUS.CONNECTED,
    });
};

describe('useNoConnectionNotice', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setProject('project-a');
        setConnection(CONNECTION_STATUS.DISCONNECTED);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const settle = () => act(() => void vi.advanceTimersByTime(SETTLE_MS));

    it('stays quiet until the connection state has settled', () => {
        const { result } = renderHook(() => useNoConnectionNotice());

        expect(result.current).toBe(false);

        settle();
        expect(result.current).toBe(true);
    });

    it('never fires for a switch that goes on to connect', () => {
        const { result, rerender } = renderHook(() => useNoConnectionNotice());

        // The window a project switch passes through: disconnected, then an
        // attempt starts, then it succeeds.
        act(() => setConnection(CONNECTION_STATUS.CONNECTING));
        rerender();
        settle();
        expect(result.current).toBe(false);

        act(() => setConnection(CONNECTION_STATUS.CONNECTED));
        rerender();
        settle();
        expect(result.current).toBe(false);
    });

    it('waits for the project to finish loading', () => {
        setProject('project-a', true);
        const { result, rerender } = renderHook(() => useNoConnectionNotice());

        settle();
        expect(result.current).toBe(false);

        act(() => setProject('project-a', false));
        rerender();
        settle();
        expect(result.current).toBe(true);
    });

    it('goes quiet again the moment a different project is opened', () => {
        const { result, rerender } = renderHook(() => useNoConnectionNotice());
        settle();
        expect(result.current).toBe(true);

        act(() => setProject('project-b'));
        rerender();
        // Same render, not one frame later: the settled answer belonged to the
        // project that was just closed.
        expect(result.current).toBe(false);

        settle();
        expect(result.current).toBe(true);
    });

    it('trusts a failed connection immediately, with no settle wait', () => {
        setConnection(CONNECTION_STATUS.ERROR);
        const { result } = renderHook(() => useNoConnectionNotice());

        expect(result.current).toBe(true);
    });

    it('says nothing when there is no project at all', () => {
        setProject(null);
        const { result } = renderHook(() => useNoConnectionNotice());

        settle();
        expect(result.current).toBe(false);
    });
});
