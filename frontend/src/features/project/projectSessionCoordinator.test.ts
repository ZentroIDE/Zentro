// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import type { Project } from '../../types/project';
import { createProjectSessionCoordinator } from './projectSessionCoordinator';

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            loadConnections: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        },
    }),
}));

function makeProject(id: string): Project {
    return {
        id,
        slug: id,
        name: id,
        description: '',
        tags: [],
        created_at: '',
        updated_at: '',
        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        last_active_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        layout_state: '',
        environments: [],
        assets: [],
    };
}

/** Fake store whose getState() actions push `${label}.${method}` onto the
 *  shared `calls` log instead of doing real work. */
function makeFakeStore(
    calls: string[],
    label: string,
    methods: string[],
    extraState: Record<string, unknown> = {},
) {
    const state: Record<string, unknown> = { ...extraState };
    for (const method of methods) {
        state[method] = vi.fn(() => calls.push(`${label}.${method}`));
    }
    return { getState: () => state };
}

type Listener = (state: ProjectStoreState, prevState: ProjectStoreState) => void;
interface ProjectStoreState {
    activeProject: Project | null;
    saveProject: (project: Project) => Promise<Project | null>;
}

function makeFakeProjectStore(calls: string[], initialActiveProject: Project | null) {
    let state: ProjectStoreState = {
        activeProject: initialActiveProject,
        saveProject: vi.fn(async (project: Project) => {
            calls.push('projectStore.saveProject');
            return project;
        }),
    };
    const listeners = new Set<Listener>();
    return {
        getState: () => state,
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setActiveProject: (project: Project | null) => {
            const prevState = state;
            state = { ...state, activeProject: project };
            listeners.forEach(listener => listener(state, prevState));
        },
    };
}

function makeDeps(calls: string[], initialActiveProject: Project | null = null) {
    const projectStore = makeFakeProjectStore(calls, initialActiveProject);
    return {
        projectStore,
        environmentStore: makeFakeStore(calls, 'environmentStore', ['clear', 'bootstrap']),
        connectionStore: makeFakeStore(calls, 'connectionStore', ['setConnections']),
        editorStore: makeFakeStore(
            calls,
            'editorStore',
            ['switchProject', 'hydrateProjectSession', 'addTab'],
            { projectSessions: {} },
        ),
        resultStore: makeFakeStore(calls, 'resultStore', ['switchProject']),
        scriptStore: makeFakeStore(calls, 'scriptStore', ['clearScope']),
        schemaStore: makeFakeStore(calls, 'schemaStore', ['resetAll']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

describe('createProjectSessionCoordinator', () => {
    it('runs onBeforeSwitch, then connection sync, then the project-switch steps in order', async () => {
        const calls: string[] = [];
        const onBeforeSwitch = vi.fn(() => calls.push('onBeforeSwitch'));
        const onSessionHydrated = vi.fn();
        const deps = makeDeps(calls, makeProject('p1'));

        const coordinator = createProjectSessionCoordinator({
            ...deps,
            onBeforeSwitch,
            onSessionHydrated,
        });
        const stop = coordinator.start();
        await Promise.resolve();
        await Promise.resolve();

        expect(calls).toEqual([
            'onBeforeSwitch',
            'connectionStore.setConnections', // sync-connections reset
            'editorStore.switchProject',
            'resultStore.switchProject',
            'scriptStore.clearScope',
            'schemaStore.resetAll',
            'editorStore.hydrateProjectSession',
            'editorStore.addTab', // empty session -> new tab
            'environmentStore.bootstrap',
            'connectionStore.setConnections', // sync-connections resolved
        ]);
        expect(onSessionHydrated).not.toHaveBeenCalled(); // empty-session branch doesn't hydrate a persisted layout

        stop();
    });

    it('clears store state in order when switching to no active project', () => {
        const calls: string[] = [];
        const onBeforeSwitch = vi.fn(() => calls.push('onBeforeSwitch'));
        const deps = makeDeps(calls, null);

        const coordinator = createProjectSessionCoordinator({ ...deps, onBeforeSwitch });
        const stop = coordinator.start();

        expect(calls).toEqual([
            'onBeforeSwitch',
            'connectionStore.setConnections', // sync-connections null-project reset (also covers clearForNoProject)
            'environmentStore.clear',
            'editorStore.switchProject',
            'resultStore.switchProject',
            'scriptStore.clearScope',
            'schemaStore.resetAll',
        ]);

        stop();
    });

    it('re-runs the transaction when activeProject.id changes, and skips it when the id is unchanged', () => {
        const calls: string[] = [];
        const deps = makeDeps(calls, makeProject('p1'));

        const coordinator = createProjectSessionCoordinator(deps);
        coordinator.start();
        calls.length = 0;

        // same id (e.g. a field on the project object mutated without switching) — no re-run
        deps.projectStore.setActiveProject(makeProject('p1'));
        expect(calls).toEqual([]);

        // different id — re-runs
        deps.projectStore.setActiveProject(makeProject('p2'));
        expect(calls).toContain('editorStore.switchProject');
    });
});
