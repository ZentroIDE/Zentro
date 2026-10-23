// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import App from './App';
import { createLicenseState } from './lib/license/types';
import { markPrivacyNoticeAccepted } from './features/telemetry/privacyNotice';

type PersistStoreKey = 'editor' | 'layout' | 'sidebar';

const mocks = vi.hoisted(() => ({
    openProject: vi.fn(),
    resetRuntime: vi.fn(),
    disconnect: vi.fn(),
    getLicenseState: vi.fn(),
    toastError: vi.fn(),
    toastApi: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const hydration = vi.hoisted(() => {
    const flags: Record<PersistStoreKey, boolean> = {
        editor: true,
        layout: true,
        sidebar: true,
    };
    const listeners: Record<PersistStoreKey, Set<() => void>> = {
        editor: new Set(),
        layout: new Set(),
        sidebar: new Set(),
    };

    return {
        exposePersistApi: true,
        flags,
        listeners,
        reset() {
            this.exposePersistApi = true;
            this.flags.editor = true;
            this.flags.layout = true;
            this.flags.sidebar = true;
            this.listeners.editor.clear();
            this.listeners.layout.clear();
            this.listeners.sidebar.clear();
        },
        setHydrated(key: PersistStoreKey, hydrated: boolean) {
            this.flags[key] = hydrated;
            if (!hydrated) return;
            this.listeners[key].forEach(listener => listener());
        },
        persistApiFor(key: PersistStoreKey) {
            if (!this.exposePersistApi) return undefined;
            return {
                hasHydrated: () => this.flags[key],
                onFinishHydration: (listener: () => void) => {
                    this.listeners[key].add(listener);
                    return () => {
                        this.listeners[key].delete(listener);
                    };
                },
            };
        },
    };
});

const projectState = {
    activeProject: null as { id: string } | null,
    hasBootstrapped: true,
    recentProjectIds: [] as string[],
    error: null as string | null,
    lastProjectActionError: null as { code: string; message: string } | null,
    projects: [
        { id: 'old-1', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'recent-1', updated_at: '2026-02-01T00:00:00Z' },
    ],
    openProject: mocks.openProject,
};

const layoutState = {
    showSidebar: false,
    showRightSidebar: false,
    setShowSidebar: vi.fn(),
    setShowRightSidebar: vi.fn(),
};

const useEditorStoreMock = vi.hoisted(() => {
    const state = {
        addTab: vi.fn(),
        groups: [] as Array<{ tabs: unknown[] }>,
    };
    const store = ((selector?: (value: typeof state) => unknown) =>
        selector ? selector(state) : state) as unknown as {
        (selector?: (value: typeof state) => unknown): unknown;
        persist?: {
            hasHydrated?: () => boolean;
            onFinishHydration?: (listener: () => void) => () => void;
        };
    };
    Object.defineProperty(store, 'persist', {
        get: () => hydration.persistApiFor('editor'),
    });
    return store;
});

const useLayoutStoreMock = vi.hoisted(() => {
    const store = ((selector?: (state: typeof layoutState) => unknown) =>
        selector ? selector(layoutState) : layoutState) as unknown as {
        (selector?: (state: typeof layoutState) => unknown): unknown;
        persist?: {
            hasHydrated?: () => boolean;
            onFinishHydration?: (listener: () => void) => () => void;
        };
    };
    Object.defineProperty(store, 'persist', {
        get: () => hydration.persistApiFor('layout'),
    });
    return store;
});

const useSidebarUiStoreMock = vi.hoisted(() => {
    const store = (() => ({})) as unknown as {
        persist?: {
            hasHydrated?: () => boolean;
            onFinishHydration?: (listener: () => void) => () => void;
        };
    };
    Object.defineProperty(store, 'persist', {
        get: () => hydration.persistApiFor('sidebar'),
    });
    return store;
});

vi.mock('./stores/projectStore', () => {
    const useProjectStore = (selector: (state: typeof projectState) => unknown) =>
        selector(projectState);
    useProjectStore.getState = () => projectState;
    return { useProjectStore };
});

vi.mock('./stores/editorStore', () => ({
    useEditorStore: useEditorStoreMock,
}));

vi.mock('./stores/sidebarUiStore', () => ({
    useSidebarUiStore: useSidebarUiStoreMock,
    useSidebarSideState: () => ({
        width: 300,
        activePanelId: 'detail',
        contextKey: 'test',
        setActivePanelId: vi.fn(),
        setWidth: vi.fn(),
    }),
}));

vi.mock('./stores/connectionStore', () => ({
    useConnectionStore: (
        selector?: (state: { isConnected: boolean; resetRuntime: () => void }) => unknown,
    ) => {
        const state = { isConnected: false, resetRuntime: mocks.resetRuntime };
        return selector ? selector(state) : state;
    },
}));

vi.mock('./stores/layoutStore', () => ({
    useLayoutStore: useLayoutStoreMock,
}));

vi.mock('./components/layout/Toast', () => ({
    useToast: () => {
        mocks.toastApi.error = mocks.toastError;
        return {
            toast: mocks.toastApi,
        };
    },
}));

vi.mock('./components/layout/Toolbar', () => ({
    Toolbar: () => <div>toolbar</div>,
}));
vi.mock('./components/layout/Sidebar', () => ({
    Sidebar: () => <div>sidebar</div>,
}));
vi.mock('./components/layout/StatusBar', () => ({
    StatusBar: () => <div>status</div>,
}));
vi.mock('./features/editor', async () => {
    const actual = await vi.importActual<typeof import('./features/editor')>('./features/editor');
    return {
        ...actual,
        QueryTabs: () => <div>tabs</div>,
        useQueryTabAutosave: () => undefined,
    };
});
vi.mock('./components/sidebar/SecondarySidebar', () => ({
    SecondarySidebar: () => <div>secondary</div>,
}));
vi.mock('./components/layout/ContextSearchDialog', () => ({
    ContextSearchDialog: () => <div>context-search</div>,
}));
vi.mock('./components/layout/ProjectHub', () => ({
    ProjectHub: () => (
        <div>
            <div data-testid='project-hub'>Project Hub</div>
        </div>
    ),
}));

vi.mock('./features/shortcuts/useGlobalShortcuts', () => ({
    useGlobalShortcuts: () => undefined,
}));
vi.mock('./features/app-runtime/useAppEventBridge', () => ({
    useAppEventBridge: () => undefined,
}));
vi.mock('./features/app-runtime/useLogEventBridge', () => ({
    useLogEventBridge: () => undefined,
}));
vi.mock('./app/useTerminalPanelRegistration', () => ({
    useTerminalPanelRegistration: () => undefined,
}));
vi.mock('./features/app-runtime/useBeforeCloseGuard', () => ({
    useBeforeCloseGuard: () => undefined,
}));
vi.mock('./features/project/useProjectLifecycle', () => ({
    useProjectLifecycle: () => undefined,
}));
vi.mock('./features/onboarding/useOnboardingTour', () => ({
    useOnboardingTour: () => undefined,
}));
vi.mock('./lib/plugin/usePluginCommandBridge', () => ({
    usePluginCommandBridge: () => undefined,
}));
vi.mock('./lib/commandBus', () => ({
    emitCommand: vi.fn(),
    onCommand: () => () => undefined,
}));
vi.mock('./platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            disconnect: mocks.disconnect,
        },
        security: {},
        project: {
            forceQuit: vi.fn(),
        },
        job: {
            list: vi.fn(async () => ({ ok: true, data: [] })),
            cancel: vi.fn(async () => ({ ok: true, data: undefined })),
            clearFinished: vi.fn(async () => ({ ok: true, data: [] })),
        },
        stats: {
            start: vi.fn(async () => ({ ok: true, data: undefined })),
            stop: vi.fn(async () => ({ ok: true, data: undefined })),
        },
    }),
    setApiGateway: vi.fn(),
    resetApiGateway: vi.fn(),
    resolveApiGatewayMode: vi.fn(() => 'local'),
    configureApiGateway: vi.fn(),
}));
vi.mock('./lib/license/service', () => ({
    LICENSE_STATE_CHANGED_EVENT: 'zentro:license-state-changed',
    getLicenseState: mocks.getLicenseState,
    isLicenseSyncAvailable: () => true,
}));

describe('App startup auto-open behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hydration.reset();
        projectState.activeProject = null;
        projectState.hasBootstrapped = true;
        projectState.recentProjectIds = [];
        projectState.error = null;
        projectState.lastProjectActionError = null;
        projectState.projects = [
            { id: 'old-1', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'recent-1', updated_at: '2026-02-01T00:00:00Z' },
        ];
        localStorage.clear();
        markPrivacyNoticeAccepted();
        mocks.disconnect.mockResolvedValue(undefined);
        mocks.openProject.mockResolvedValue({ id: 'recent-1' });
        mocks.getLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows startup loading while project bootstrap has not finished', async () => {
        projectState.hasBootstrapped = false;
        render(<App />);

        expect(screen.getByTestId('startup-loading')).toBeInTheDocument();
        expect(screen.queryByTestId('project-welcome')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(mocks.openProject).not.toHaveBeenCalled();
        });
    });

    it('auto-opens the most recently opened project when available', async () => {
        projectState.recentProjectIds = ['recent-1'];
        render(<App />);

        await waitFor(() => {
            expect(mocks.openProject).toHaveBeenCalledWith('recent-1');
        });
        expect(mocks.disconnect).toHaveBeenCalled();
        expect(mocks.resetRuntime).toHaveBeenCalled();
    });

    it('falls back to the latest updated project when no recent project exists', async () => {
        projectState.recentProjectIds = [];
        render(<App />);

        await waitFor(() => {
            expect(mocks.openProject).toHaveBeenCalledWith('recent-1');
        });
    });

    it('lands in the workspace Welcome with an error toast when auto-open returns null', async () => {
        projectState.recentProjectIds = ['recent-1'];
        projectState.error = 'Backend rejected project open';
        mocks.openProject.mockResolvedValue(null);
        render(<App />);

        await waitFor(() => {
            expect(screen.getByTestId('project-welcome')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(mocks.toastError).toHaveBeenCalledWith(
                'Backend rejected project open',
                expect.objectContaining({
                    important: true,
                    source: 'startup.auto-open',
                    dedupeKey: 'startup-auto-open',
                }),
            );
        });
    });

    it('stays silent (no toast) when auto-open hits a project lock', async () => {
        // The backend focuses the window that already has it open instead —
        // no toast, just fall through to the workspace Welcome.
        projectState.recentProjectIds = ['recent-1'];
        projectState.lastProjectActionError = {
            code: 'project_locked',
            message: 'cannot open "P": project is already open in another Zentro window',
        };
        mocks.openProject.mockResolvedValue(null);
        render(<App />);

        await waitFor(() => {
            expect(screen.getByTestId('project-welcome')).toBeInTheDocument();
        });
        expect(mocks.toastError).not.toHaveBeenCalled();
    });

    it('lands in the workspace Welcome when there are no projects to auto-open', async () => {
        projectState.recentProjectIds = [];
        projectState.projects = [];
        render(<App />);

        await waitFor(() => {
            expect(screen.getByTestId('project-welcome')).toBeInTheDocument();
        });
        expect(mocks.openProject).not.toHaveBeenCalled();
    });

    it('shows the privacy notice first on a fresh install', async () => {
        localStorage.clear();
        projectState.projects = [];
        mocks.getLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({ status: 'inactive', tier: 'free' }),
        });
        render(<App />);

        expect(await screen.findByText('Before you get started')).toBeInTheDocument();
        expect(screen.getByTestId('project-welcome')).toBeInTheDocument();
    });

    it('attempts startup auto-open only once across rerenders', async () => {
        projectState.recentProjectIds = ['recent-1'];
        const { rerender } = render(<App />);
        rerender(<App />);
        await waitFor(() => {
            expect(mocks.openProject).toHaveBeenCalledTimes(1);
        });
    });

    it('keeps loading after core startup until persisted stores are hydrated', async () => {
        projectState.activeProject = { id: 'active-1' };
        hydration.setHydrated('editor', false);
        hydration.setHydrated('layout', false);
        hydration.setHydrated('sidebar', false);

        render(<App />);
        expect(screen.getByTestId('startup-loading')).toBeInTheDocument();
        expect(screen.getByText('Restoring your workspace state...')).toBeInTheDocument();
        expect(screen.queryByText('toolbar')).not.toBeInTheDocument();
    });

    it('renders app when persisted stores finish hydration before timeout', async () => {
        projectState.activeProject = { id: 'active-1' };
        hydration.setHydrated('editor', false);
        hydration.setHydrated('layout', false);
        hydration.setHydrated('sidebar', false);

        render(<App />);
        expect(screen.getByTestId('startup-loading')).toBeInTheDocument();

        await act(async () => {
            hydration.setHydrated('editor', true);
            hydration.setHydrated('layout', true);
            hydration.setHydrated('sidebar', true);
        });

        await waitFor(() => {
            expect(screen.getByText('toolbar')).toBeInTheDocument();
        });
    });

    it('falls back after 2 seconds when persisted hydration does not finish', async () => {
        vi.useFakeTimers();
        projectState.activeProject = { id: 'active-1' };
        hydration.setHydrated('editor', false);
        hydration.setHydrated('layout', false);
        hydration.setHydrated('sidebar', false);

        render(<App />);
        expect(screen.getByTestId('startup-loading')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByText('toolbar')).toBeInTheDocument();
    });

    it('does not block app when persist api is unavailable in runtime', async () => {
        projectState.activeProject = { id: 'active-1' };
        hydration.exposePersistApi = false;

        render(<App />);

        await waitFor(() => {
            expect(screen.getByText('toolbar')).toBeInTheDocument();
        });
        const loading = screen.getByTestId('startup-loading');
        expect(loading.className).toContain('opacity-0');
        expect(loading.className).toContain('pointer-events-none');
    });
});
