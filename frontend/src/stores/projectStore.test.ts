// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types/project';
import { ENVIRONMENT_KEY } from '../lib/constants';

const projectGatewayMock = vi.hoisted(() => ({
    listProjects: vi.fn(),
    getActiveProject: vi.fn(),
    openProject: vi.fn(),
    getLaunchProjectID: vi.fn(),
    createProject: vi.fn(),
    saveProject: vi.fn(),
    deleteProject: vi.fn(),
}));

vi.mock('../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ project: projectGatewayMock }),
}));

import { useProjectStore } from './projectStore';

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'p1',
        slug: 'project-1',
        name: 'Project 1',
        description: '',
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        last_active_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        layout_state: '',
        environments: [],
        assets: [],
        ...overrides,
    };
}

describe('projectStore', () => {
    beforeEach(() => {
        Object.values(projectGatewayMock).forEach(mockFn => mockFn.mockReset());
        projectGatewayMock.getLaunchProjectID.mockResolvedValue({ ok: true, data: '' });
        useProjectStore.setState({
            projects: [],
            activeProject: null,
            selectedProjectId: null,
            recentProjectIds: [],
            launchProjectId: null,
            isLoading: false,
            error: null,
            lastProjectActionError: null,
        });
    });

    it('bootstraps projects and hydrates active project', async () => {
        const active = makeProject({
            id: 'active-1',
            default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        });
        projectGatewayMock.listProjects.mockResolvedValue({ ok: true, data: [active] });
        projectGatewayMock.getActiveProject.mockResolvedValue({ ok: true, data: active });

        await useProjectStore.getState().bootstrap();

        const state = useProjectStore.getState();
        expect(state.projects).toHaveLength(1);
        expect(state.activeProject?.id).toBe('active-1');
        expect(state.selectedProjectId).toBe('active-1');
        expect(state.recentProjectIds).toEqual(['active-1']);
        expect(state.error).toBeNull();
    });

    it('bootstraps projects and launch project id when no project is active yet', async () => {
        // A freshly spawned window (e.g. "open in new window") has no active
        // project — getActiveProject reports ok:true with data:null, which
        // must not abort the rest of bootstrap (listProjects, launch id).
        const other = makeProject({ id: 'p-other' });
        projectGatewayMock.listProjects.mockResolvedValue({ ok: true, data: [other] });
        projectGatewayMock.getActiveProject.mockResolvedValue({ ok: true, data: null });
        projectGatewayMock.getLaunchProjectID.mockResolvedValue({ ok: true, data: 'p-other' });

        await useProjectStore.getState().bootstrap();

        const state = useProjectStore.getState();
        expect(state.projects).toHaveLength(1);
        expect(state.activeProject).toBeNull();
        expect(state.launchProjectId).toBe('p-other');
        expect(state.error).toBeNull();
    });

    it('updates environment and persists through saveProject flow', async () => {
        const current = makeProject({
            id: 'p-env',
            default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
            environments: [],
        });
        useProjectStore.setState({
            activeProject: current,
            projects: [current],
            selectedProjectId: current.id,
        });

        const saved = makeProject({
            ...current,
            default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
            last_active_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
            environments: [
                {
                    id: 'env-dev',
                    project_id: current.id,
                    key: ENVIRONMENT_KEY.DEVELOPMENT,
                    label: 'Development',
                    is_protected: false,
                    is_read_only: false,
                },
            ],
        });
        projectGatewayMock.saveProject.mockResolvedValue({ ok: true, data: saved });

        const result = await useProjectStore
            .getState()
            .setProjectEnvironment(ENVIRONMENT_KEY.DEVELOPMENT);

        expect(projectGatewayMock.saveProject).toHaveBeenCalledTimes(1);
        expect(result?.default_environment_key).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
        expect(
            result?.environments?.some(
                environment => environment.key === ENVIRONMENT_KEY.DEVELOPMENT,
            ),
        ).toBe(true);
    });

    it('tracks recent projects when opening, keeps max 4, and deduplicates', async () => {
        const projects = [
            makeProject({ id: 'p1', name: 'P1' }),
            makeProject({ id: 'p2', name: 'P2' }),
            makeProject({ id: 'p3', name: 'P3' }),
            makeProject({ id: 'p4', name: 'P4' }),
        ];
        useProjectStore.setState({ projects, recentProjectIds: ['p1', 'p2'] });

        projectGatewayMock.openProject.mockResolvedValue({
            ok: true,
            data: makeProject({ id: 'p3', name: 'P3' }),
        });
        await useProjectStore.getState().openProject('p3');

        projectGatewayMock.openProject.mockResolvedValue({
            ok: true,
            data: makeProject({ id: 'p2', name: 'P2' }),
        });
        await useProjectStore.getState().openProject('p2');

        projectGatewayMock.openProject.mockResolvedValue({
            ok: true,
            data: makeProject({ id: 'p4', name: 'P4' }),
        });
        await useProjectStore.getState().openProject('p4');

        expect(useProjectStore.getState().recentProjectIds).toEqual(['p4', 'p2', 'p3', 'p1']);
    });

    it('clears the saved schema context for an existing environment', async () => {
        const current = makeProject({
            id: 'p-schema',
            environments: [
                {
                    id: 'env-dev',
                    project_id: 'p-schema',
                    key: ENVIRONMENT_KEY.DEVELOPMENT,
                    label: 'Development',
                    is_protected: false,
                    is_read_only: false,
                    last_schema: 'public',
                },
            ],
        });
        useProjectStore.setState({
            activeProject: current,
            projects: [current],
            selectedProjectId: current.id,
        });

        const saved = makeProject({
            ...current,
            environments: [
                {
                    id: 'env-dev',
                    project_id: 'p-schema',
                    key: ENVIRONMENT_KEY.DEVELOPMENT,
                    label: 'Development',
                    is_protected: false,
                    is_read_only: false,
                },
            ],
        });
        projectGatewayMock.saveProject.mockResolvedValue({ ok: true, data: saved });

        const result = await useProjectStore
            .getState()
            .setEnvironmentLastSchema(ENVIRONMENT_KEY.DEVELOPMENT, '');

        expect(projectGatewayMock.saveProject).toHaveBeenCalledTimes(1);
        expect(result?.environments?.[0]?.last_schema).toBeUndefined();
    });

    it('removes deleted project id from recent list', async () => {
        useProjectStore.setState({
            projects: [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })],
            recentProjectIds: ['p2', 'p1'],
            activeProject: makeProject({ id: 'p1' }),
            selectedProjectId: 'p1',
        });
        projectGatewayMock.deleteProject.mockResolvedValue({ ok: true, data: undefined });

        const ok = await useProjectStore.getState().deleteProject('p2');

        expect(ok).toBe(true);
        expect(useProjectStore.getState().recentProjectIds).toEqual(['p1']);
    });

    it('stores normalized open errors for project-lock handling', async () => {
        projectGatewayMock.openProject.mockResolvedValue({
            ok: false,
            error: {
                code: 'project.open.failed',
                message: 'Failed to open project',
                context: {
                    cause: 'cannot open "Project 2": project is already open in another Zentro window',
                },
            },
        });
        projectGatewayMock.listProjects.mockResolvedValue({ ok: true, data: [] });

        const result = await useProjectStore.getState().openProject('p2');

        expect(result).toBeNull();
        expect(useProjectStore.getState().lastProjectActionError?.code).toBe('project_locked');
        expect(useProjectStore.getState().activeProject).toBeNull();
        // The other window gets focused instead — stay silent, no error banner.
        expect(useProjectStore.getState().error).toBeNull();
    });

    it('stores normalized create errors for project-cap handling', async () => {
        projectGatewayMock.createProject.mockResolvedValue({
            ok: false,
            error: {
                code: 'project.create.failed',
                message: 'Failed to create project',
                context: {
                    cause: 'free plan limit: you can have up to 5 projects. Upgrade to Pro for unlimited projects',
                },
            },
        });

        const result = await useProjectStore.getState().createProject({
            name: 'Project 6',
        });

        expect(result).toBeNull();
        expect(useProjectStore.getState().lastProjectActionError?.code).toBe(
            'project_limit_reached',
        );
        expect(useProjectStore.getState().error).toContain('free plan limit');
    });
});
