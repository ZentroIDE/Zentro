// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react';

import { appLogger } from '../../lib/logger';
import { useProjectStore } from '../../stores/projectStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useSidebarUiStore } from '../../stores/sidebarUiStore';
import { getApiGateway } from '../../platform/apiGatewayRuntime';

export type StartupPhase = 'bootstrapping' | 'autoOpening' | 'hydratingAppState' | 'ready';

interface PersistApi {
    hasHydrated?: () => boolean;
    onFinishHydration?: (listener: () => void) => (() => void) | void;
}

interface PersistEnabledStore {
    persist?: PersistApi;
}

function readPersistApi(store: unknown): PersistApi | null {
    const candidate = (store as PersistEnabledStore | undefined)?.persist;
    return candidate || null;
}

function isPersistStoreReady(store: unknown): boolean {
    const persistApi = readPersistApi(store);
    if (!persistApi || typeof persistApi.hasHydrated !== 'function') {
        return true;
    }
    return Boolean(persistApi.hasHydrated());
}

const HYDRATION_TIMEOUT_MS = 2000;

/**
 * Drives Zentro's startup state machine:
 *
 *   bootstrapping → autoOpening → hydratingAppState → ready
 *
 * - `bootstrapping`: projectStore hasn't finished loading the registry yet.
 * - `autoOpening`: registry is ready but no project is active; try to reopen
 *   the most recent / latest project. Fires at most once per mount.
 * - `hydratingAppState`: a project is active; wait for zustand persist
 *   middleware in editor / layout / sidebar-ui stores to finish hydrating
 *   (bounded by a 2s timeout so we don't hang on a missing onFinishHydration).
 * - `ready`: the UI may render.
 *
 * Errors during auto-open surface as toasts via `onAutoOpenError`.
 */
export function useStartupPhase(onAutoOpenError: (message: string) => void): StartupPhase {
    const [startupPhase, setStartupPhase] = useState<StartupPhase>('bootstrapping');
    const startupAutoOpenAttemptedRef = useRef(false);
    const persistedStateGateDoneRef = useRef(false);

    const activeProject = useProjectStore(state => state.activeProject);
    const projects = useProjectStore(state => state.projects);
    const recentProjectIds = useProjectStore(state => state.recentProjectIds);
    const launchProjectId = useProjectStore(state => state.launchProjectId);
    const hasBootstrapped = useProjectStore(state => state.hasBootstrapped);
    const projectStoreError = useProjectStore(state => state.error);
    const openProject = useProjectStore(state => state.openProject);
    const resetRuntime = useConnectionStore(state => state.resetRuntime);

    // Phase 1: bootstrap → autoOpening → ready (when no project to auto-open) /
    //                                       hydratingAppState (when a project opens).
    useEffect(() => {
        if (!hasBootstrapped) {
            setStartupPhase('bootstrapping');
            startupAutoOpenAttemptedRef.current = false;
            persistedStateGateDoneRef.current = false;
            return;
        }

        if (activeProject?.id) {
            setStartupPhase(persistedStateGateDoneRef.current ? 'ready' : 'hydratingAppState');
            return;
        }

        if (startupAutoOpenAttemptedRef.current) {
            setStartupPhase('ready');
            return;
        }

        startupAutoOpenAttemptedRef.current = true;

        const recentProjectId = recentProjectIds[0];
        const latestUpdatedProjectId = [...projects].sort((a, b) =>
            (b.updated_at || '').localeCompare(a.updated_at || ''),
        )[0]?.id;
        // A project id this window was launched with (via "Open in new
        // window") always wins over recency — it's an explicit user choice.
        const targetProjectId = launchProjectId || recentProjectId || latestUpdatedProjectId;
        appLogger.debug('startup auto-open target resolved', {
            launchProjectId,
            recentProjectId,
            latestUpdatedProjectId,
            targetProjectId,
        });

        if (!targetProjectId) {
            setStartupPhase('ready');
            return;
        }

        setStartupPhase('autoOpening');
        let cancelled = false;

        const tryAutoOpen = async () => {
            try {
                await getApiGateway().connection.disconnect();
                const project = await openProject(targetProjectId);
                resetRuntime();

                if (cancelled) return;
                if (!project) {
                    // Read fresh state — the closure's projectStoreError predates
                    // this open attempt and would report a stale (usually null) error.
                    const { lastProjectActionError, error } = useProjectStore.getState();
                    if (lastProjectActionError?.code !== 'project_locked') {
                        // The window that already has it open gets focused
                        // (best-effort) on the backend — no toast needed.
                        onAutoOpenError(
                            lastProjectActionError?.message ||
                                error ||
                                'Could not auto-open the last project. Please choose one manually.',
                        );
                    }
                }
            } catch (error) {
                resetRuntime();
                if (cancelled) return;
                const message =
                    projectStoreError || (error instanceof Error ? error.message : String(error));
                onAutoOpenError(`Could not auto-open the last project: ${message}`);
            } finally {
                if (!cancelled) {
                    setStartupPhase('ready');
                }
            }
        };

        void tryAutoOpen();
        return () => {
            cancelled = true;
        };
    }, [
        activeProject?.id,
        hasBootstrapped,
        launchProjectId,
        onAutoOpenError,
        openProject,
        projectStoreError,
        projects,
        recentProjectIds,
        resetRuntime,
    ]);

    // Phase 2: hydratingAppState → ready, gated on zustand persist stores.
    useEffect(() => {
        if (!activeProject?.id) return;
        if (startupPhase === 'bootstrapping' || startupPhase === 'autoOpening') return;

        if (persistedStateGateDoneRef.current) {
            setStartupPhase('ready');
            return;
        }

        const persistStores: unknown[] = [useEditorStore, useLayoutStore, useSidebarUiStore];
        const allStoresReady = () => persistStores.every(store => isPersistStoreReady(store));

        if (allStoresReady()) {
            persistedStateGateDoneRef.current = true;
            setStartupPhase('ready');
            return;
        }

        setStartupPhase('hydratingAppState');

        let cancelled = false;
        const finishGate = () => {
            if (cancelled || persistedStateGateDoneRef.current) return;
            persistedStateGateDoneRef.current = true;
            setStartupPhase('ready');
        };

        const unsubscribers = persistStores.map(store => {
            const persistApi = readPersistApi(store);
            if (!persistApi || typeof persistApi.onFinishHydration !== 'function') return () => {};
            const unsubscribe = persistApi.onFinishHydration(() => {
                if (allStoresReady()) finishGate();
            });
            return typeof unsubscribe === 'function' ? unsubscribe : () => {};
        });

        const timeoutId = window.setTimeout(() => {
            finishGate();
        }, HYDRATION_TIMEOUT_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
            unsubscribers.forEach(unsubscribe => unsubscribe());
        };
    }, [activeProject?.id, startupPhase]);

    return startupPhase;
}
