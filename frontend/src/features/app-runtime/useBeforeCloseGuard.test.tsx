// SPDX-License-Identifier: GPL-3.0-only

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBeforeCloseGuard } from './useBeforeCloseGuard';
import { useEditorStore } from '../../stores/editorStore';
import { useActivityStore } from '../../stores/activityStore';
import type { Job } from '../../platform/app-api/contracts/job';

// Captured 'app:before-close' callback so tests can fire the event manually.
let capturedHandler: ((...args: unknown[]) => void) | null = null;
const mockOff = vi.fn();
const mockEventsOn = vi.fn();

vi.mock('../../../wailsjs/runtime/runtime', () => ({
    EventsOn: (event: string, handler: (...args: unknown[]) => void) => {
        capturedHandler = event === 'app:before-close' ? handler : capturedHandler;
        mockEventsOn(event, handler);
        return mockOff;
    },
}));

const mockForceQuit = vi.fn().mockResolvedValue(undefined);
vi.mock('./forceQuitWithAutosave', () => ({
    forceQuitWithAutosave: () => mockForceQuit(),
}));

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: 'job-1',
        kind: 'export',
        title: 'Export → query_result.csv',
        status: 'running',
        progress: { done: 0 },
        startedAt: new Date().toISOString(),
        capabilities: { cancel: true, kill: false },
        ...overrides,
    };
}

function seedTabs(tabs: Array<{ id: string; isRunning?: boolean }>) {
    useEditorStore.setState({
        projectSessions: {
            __default__: {
                groups: [{ id: 'g', tabs, activeTabId: tabs[0]?.id ?? null }],
                activeGroupId: 'g',
            },
        },
        activeProjectId: '__default__',
        groups: [{ id: 'g', tabs, activeTabId: tabs[0]?.id ?? null }],
        activeGroupId: 'g',
    } as any);
}

describe('useBeforeCloseGuard', () => {
    beforeEach(() => {
        capturedHandler = null;
        mockEventsOn.mockClear();
        mockOff.mockClear();
        mockForceQuit.mockClear();
        useActivityStore.getState().reset();
    });

    it('registers a listener for app:before-close on mount', () => {
        renderHook(() => useBeforeCloseGuard(() => {}));
        expect(mockEventsOn).toHaveBeenCalledTimes(1);
        expect(mockEventsOn.mock.calls[0][0]).toBe('app:before-close');
    });

    it('calls forceQuitWithAutosave directly when no tab is running', () => {
        seedTabs([{ id: 't1' }]);
        const onConfirm = vi.fn();
        renderHook(() => useBeforeCloseGuard(onConfirm));

        capturedHandler?.();

        expect(mockForceQuit).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('calls onRequireConfirm and skips force-quit when any tab is running', () => {
        seedTabs([{ id: 't1', isRunning: true }]);
        const onConfirm = vi.fn();
        renderHook(() => useBeforeCloseGuard(onConfirm));

        capturedHandler?.();

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(mockForceQuit).not.toHaveBeenCalled();
    });

    it('calls onRequireConfirm and skips force-quit when an Activity-panel job is running', () => {
        seedTabs([{ id: 't1' }]);
        useActivityStore.getState().hydrate([makeJob({ status: 'running' })]);
        const onConfirm = vi.fn();
        renderHook(() => useBeforeCloseGuard(onConfirm));

        capturedHandler?.();

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(mockForceQuit).not.toHaveBeenCalled();
    });

    it('force-quits when a job exists but has already finished', () => {
        seedTabs([{ id: 't1' }]);
        useActivityStore.getState().hydrate([makeJob({ status: 'succeeded' })]);
        const onConfirm = vi.fn();
        renderHook(() => useBeforeCloseGuard(onConfirm));

        capturedHandler?.();

        expect(mockForceQuit).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('unsubscribes the listener on unmount', () => {
        const { unmount } = renderHook(() => useBeforeCloseGuard(() => {}));
        unmount();
        expect(mockOff).toHaveBeenCalledTimes(1);
    });
});
