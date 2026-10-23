// SPDX-License-Identifier: GPL-3.0-only

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_STATUS } from '../../lib/constants';

// Regression test for a race condition: switching the Active Environment
// updates connectionStore.activeProfile (via the backend's Connecting
// event) before environmentStore.activeEnvironmentKey catches up (which
// only happens once useEnvironmentSwitch's connect call fully resolves).
// During that window, the auto-reconnect effect used to see "activeProfile
// says Production, activeEnvironmentKey still says Development" and
// "corrected" it by reconnecting back to Development — racing the switch
// already in flight and producing a visible flicker between environments.

const mocks = vi.hoisted(() => ({
    connectProjectEnvironment: vi.fn(async () => ({ ok: true, data: undefined })),
    loadConnections: vi.fn(async () => ({ ok: true, data: [] })),
    getConnectionStatus: vi.fn(async () => ({
        ok: true,
        data: { status: 'disconnected', profile: null },
    })),
    fetchDatabaseSchema: vi.fn(async () => ({ ok: true, data: undefined })),
}));

const projectState = {
    activeProject: null as any,
    isSwitchingProject: false,
    bootstrap: vi.fn(async () => undefined),
    setProjectEnvironment: vi.fn(async () => null),
    setEnvironmentLastSchema: vi.fn(async () => null),
    saveProject: vi.fn(async () => null),
};

const environmentState = { activeEnvironmentKey: null as string | null, isSwitching: false };

const connectionState = {
    activeProfile: null as { name: string; db_name: string } | null,
    connectionStatus: CONNECTION_STATUS.DISCONNECTED as string,
    setConnections: vi.fn(),
};

const statusState = { setMessage: vi.fn() };
const editorState = { groups: [] as any[], activeGroupId: null, activeProjectId: null };
const scriptState = { loadScripts: vi.fn(async () => undefined) };
const schemaState = {
    trees: {} as Record<string, unknown>,
    loadingKeys: new Set<string>(),
    setLoading: vi.fn(),
};

vi.mock('../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
}));
vi.mock('../../stores/environmentStore', () => ({
    useEnvironmentStore: (selector: (state: typeof environmentState) => unknown) =>
        selector(environmentState),
}));
vi.mock('../../stores/connectionStore', () => ({
    useConnectionStore: (selector: (state: typeof connectionState) => unknown) =>
        selector(connectionState),
}));
vi.mock('../../stores/statusStore', () => ({
    useStatusStore: (selector: (state: typeof statusState) => unknown) => selector(statusState),
}));
vi.mock('../../stores/editorStore', () => ({
    useEditorStore: (selector: (state: typeof editorState) => unknown) => selector(editorState),
}));
vi.mock('../../stores/scriptStore', () => ({
    useScriptStore: (selector: (state: typeof scriptState) => unknown) => selector(scriptState),
}));
vi.mock('../../stores/schemaStore', () => ({
    useSchemaStore: (selector: (state: typeof schemaState) => unknown) => selector(schemaState),
}));
vi.mock('../../stores/settingsStore', () => ({
    useSettingsStore: { getState: () => ({ load: vi.fn() }) },
}));
vi.mock('./startupRecovery', () => ({
    recoverStartupState: () => ({ warnings: [] }),
}));
vi.mock('./projectSessionCoordinator', () => ({
    createProjectSessionCoordinator: () => ({ start: () => () => undefined }),
}));
vi.mock('./projectSessionCodec', () => ({
    serializeProjectEditorSession: () => '',
    withProjectLayoutState: (p: unknown) => p,
}));
vi.mock('../../stores/sidebarUiStore', () => ({
    useSidebarSideState: () => ({ width: 250, setWidth: vi.fn() }),
}));
vi.mock('../../lib/logger', () => ({
    appLogger: { warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            loadConnections: mocks.loadConnections,
            getConnectionStatus: mocks.getConnectionStatus,
        },
        project: {
            connectProjectEnvironment: mocks.connectProjectEnvironment,
        },
        schema: {
            fetchDatabaseSchema: mocks.fetchDatabaseSchema,
        },
    }),
}));
vi.mock('../../shared/kernel', () => ({
    unwrapOrThrow: (result: { ok: boolean; data?: unknown; error?: { message?: string } }) => {
        if (result && result.ok === false) throw new Error(result.error?.message || 'error');
        return result?.data;
    },
}));

// Imported after the mocks above so the hook picks up the mocked stores/gateway.
import { useProjectLifecycle } from './useProjectLifecycle';

function makeProject() {
    return {
        id: 'proj-1',
        default_environment_key: 'dev',
        last_active_environment_key: 'dev',
        environments: [
            { key: 'dev', connection_ref: 'dev-profile', last_database: 'db1' },
            { key: 'pro', connection_ref: 'prod-profile', last_database: 'db2' },
        ],
    } as any;
}

describe('useProjectLifecycle auto-reconnect effect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.connectProjectEnvironment.mockResolvedValue({ ok: true, data: undefined });
        projectState.activeProject = makeProject();
        environmentState.activeEnvironmentKey = 'dev';
        environmentState.isSwitching = false;
        connectionState.activeProfile = { name: 'dev-profile', db_name: 'db1' };
        connectionState.connectionStatus = CONNECTION_STATUS.CONNECTED;
        editorState.groups = [];
        editorState.activeGroupId = null;
        editorState.activeProjectId = null;
        schemaState.trees = {};
        schemaState.loadingKeys = new Set<string>();
    });

    it('does not race an in-flight explicit switch by reconnecting to the stale environment', () => {
        const { rerender } = renderHook(() => useProjectLifecycle());
        mocks.connectProjectEnvironment.mockClear();

        // The real race window isn't while status is still Connecting — the
        // pre-existing `connectAttemptRef.current === targetKey` guard
        // already covers that, because targetKey is computed from the
        // (still-stale) activeEnvironmentKey and so happens to match the
        // ref left over from the last time that environment settled. The
        // window that guard misses is the render right after the Connected
        // event lands (status flips to Connected, activeProfile flips to
        // Production) but *before* useEnvironmentSwitch's separate
        // `setActiveEnvironment(envKey)` call updates
        // environmentStore.activeEnvironmentKey — for that one render,
        // status is Connected (not Connecting) while activeProfile and
        // activeEnvironmentKey point at two different environments.
        // useEnvironmentSwitch holds environmentStore.isSwitching for
        // exactly this span, which is what this effect must respect.
        connectionState.connectionStatus = CONNECTION_STATUS.CONNECTED;
        connectionState.activeProfile = { name: 'prod-profile', db_name: 'db2' };
        environmentState.isSwitching = true;
        // environmentState.activeEnvironmentKey intentionally left at 'dev'.

        rerender();

        expect(mocks.connectProjectEnvironment).not.toHaveBeenCalled();
    });

    it('still reconnects normally once nothing is in flight and state is genuinely out of sync', () => {
        // Simulates app startup: connected to nothing yet, but the project
        // says Development should be active. isSwitching is false — no
        // explicit switch owns this mismatch, so the effect should act.
        connectionState.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
        connectionState.activeProfile = null;

        renderHook(() => useProjectLifecycle());

        expect(mocks.connectProjectEnvironment).toHaveBeenCalledWith('dev');
    });

    it('reconnects to reconcile a stale profile once an explicit switch releases the lock', () => {
        const { rerender } = renderHook(() => useProjectLifecycle());
        mocks.connectProjectEnvironment.mockClear();

        // isSwitching released, but activeEnvironmentKey still hasn't been
        // updated (e.g. useEnvironmentSwitch's own setActiveEnvironment
        // call — the very next line after the lock release in production —
        // hasn't landed in this render yet). This mismatch is no longer
        // "owned" by an in-flight switch, so the effect must still be able
        // to reconcile it rather than staying silent forever.
        connectionState.connectionStatus = CONNECTION_STATUS.CONNECTED;
        connectionState.activeProfile = { name: 'prod-profile', db_name: 'db2' };
        environmentState.isSwitching = false;
        // environmentState.activeEnvironmentKey intentionally left at 'dev'.

        rerender();

        expect(mocks.connectProjectEnvironment).toHaveBeenCalledWith('dev');
    });
});
