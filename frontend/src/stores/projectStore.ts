// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEY, ENVIRONMENT_KEY } from '../lib/constants';
import {
    type ProjectServiceError,
    normalizeProjectServiceError,
    listProjects,
    getActiveProject,
    openProject,
    openProjectFromDirectory,
    getLaunchProjectId,
    createProject,
    persistProject,
    deleteProject,
} from '../services/project';
import type { EnvironmentKey, Project, ProjectEnvironment } from '../types/project';
import { getEnvironmentLabel } from '../lib/projects';
import { withStoreLogger } from './logger';

interface ProjectState {
    projects: Project[];
    activeProject: Project | null;
    selectedProjectId: string | null;
    recentProjectIds: string[];
    /** Project id this window was launched with via "Open in new window"; consumed once at startup. */
    launchProjectId: string | null;
    hasBootstrapped: boolean;
    isLoading: boolean;
    error: string | null;
    lastProjectActionError: ProjectServiceError | null;
    /** True for the whole span of useOpenProject's switch transaction — from
     *  before the old connection is torn down until the new project's
     *  connection state has settled. useProjectLifecycle's auto-reconnect
     *  effect must not act during that window: the outgoing disconnect fires
     *  a Disconnected event that re-triggers the effect while activeProject
     *  here is still the OLD project, so without this guard it reconnects to
     *  the old project's environment/connection instead of the new one's. */
    isSwitchingProject: boolean;

    loadProjects: () => Promise<Project[]>;
    bootstrap: () => Promise<void>;
    openProject: (projectId: string) => Promise<Project | null>;
    /** Admits and activates an existing Zentro project folder (one with a project.json). */
    openProjectFromFolder: (directoryPath: string) => Promise<Project | null>;
    createProject: (input: {
        name: string;
        description?: string;
        color?: string;
        tags?: string[];
        storage_path?: string;
    }) => Promise<Project | null>;
    saveProject: (project: Project) => Promise<Project | null>;
    deleteProject: (projectId: string) => Promise<boolean>;
    setProjectEnvironment: (environmentKey: EnvironmentKey) => Promise<Project | null>;
    setEnvironmentLastSchema: (
        environmentKey: EnvironmentKey,
        schemaName: string,
    ) => Promise<Project | null>;
    bindEnvironmentConnection: (
        environmentKey: EnvironmentKey,
        connectionName: string,
        database?: string,
    ) => Promise<Project | null>;
    patchProject: (project: Project) => void;
    setActiveProject: (project: Project | null) => void;
    clearActiveProject: () => void;
    clearProjectActionError: () => void;
    setIsSwitchingProject: (value: boolean) => void;
}

const MAX_RECENT_PROJECTS = 4;

function pushRecentProject(recentProjectIds: string[], projectId: string): string[] {
    return [projectId, ...recentProjectIds.filter(id => id !== projectId)].slice(
        0,
        MAX_RECENT_PROJECTS,
    );
}

function sanitizeRecentProjects(recentProjectIds: string[], projects: Project[]): string[] {
    if (recentProjectIds.length === 0) return recentProjectIds;
    const validIds = new Set(projects.map(project => project.id));
    return recentProjectIds.filter(projectId => validIds.has(projectId));
}

function patchProjects(projects: Project[], project: Project) {
    const nextProjects = projects.some(item => item.id === project.id)
        ? projects.map(item => (item.id === project.id ? project : item))
        : [...projects, project];

    return [...nextProjects].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function buildProjectEnvironment(projectId: string, key: EnvironmentKey): ProjectEnvironment {
    return {
        id: crypto.randomUUID(),
        project_id: projectId,
        key,
        label: getEnvironmentLabel(key),
        badge_color: key,
        is_protected: key === ENVIRONMENT_KEY.STAGING || key === ENVIRONMENT_KEY.PRODUCTION,
        is_read_only: key === ENVIRONMENT_KEY.PRODUCTION,
    };
}

export const useProjectStore = create<ProjectState>()(
    persist(
        withStoreLogger('projectStore', (set, get) => ({
            projects: [],
            activeProject: null,
            selectedProjectId: null,
            recentProjectIds: [],
            launchProjectId: null,
            hasBootstrapped: false,
            isLoading: false,
            error: null,
            lastProjectActionError: null,
            isSwitchingProject: false,

            loadProjects: async () => {
                set({ isLoading: true, error: null, lastProjectActionError: null });
                try {
                    const projects = await listProjects();
                    set({ projects, isLoading: false });
                    return projects;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    set({ isLoading: false, error: message });
                    return [];
                }
            },

            bootstrap: async () => {
                set({
                    isLoading: true,
                    error: null,
                    lastProjectActionError: null,
                    hasBootstrapped: false,
                });
                try {
                    const projects = await listProjects();
                    const active = await getActiveProject();
                    const launchProjectId = await getLaunchProjectId();
                    const selectedProjectId = get().selectedProjectId;
                    const currentRecent = get().recentProjectIds;
                    const hydratedActive = active
                        ? {
                              ...active,
                              last_active_environment_key:
                                  active.last_active_environment_key ||
                                  active.default_environment_key ||
                                  ENVIRONMENT_KEY.DEVELOPMENT,
                          }
                        : null;
                    let recentProjectIds = sanitizeRecentProjects(currentRecent, projects);
                    if (hydratedActive?.id) {
                        recentProjectIds = pushRecentProject(recentProjectIds, hydratedActive.id);
                    }

                    set({
                        projects,
                        activeProject: hydratedActive,
                        selectedProjectId: hydratedActive?.id || selectedProjectId || null,
                        recentProjectIds,
                        launchProjectId,
                        hasBootstrapped: true,
                        isLoading: false,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    set({ isLoading: false, error: message, hasBootstrapped: true });
                }
            },

            openProject: async (projectId: string) => {
                set({ isLoading: true, error: null, lastProjectActionError: null });
                try {
                    const project = await openProject(projectId);
                    const projects =
                        get().projects.length > 0 ? get().projects : await listProjects();
                    const hydratedProject = project
                        ? {
                              ...project,
                              last_active_environment_key:
                                  project.last_active_environment_key ||
                                  project.default_environment_key ||
                                  ENVIRONMENT_KEY.DEVELOPMENT,
                          }
                        : null;
                    let recentProjectIds = sanitizeRecentProjects(get().recentProjectIds, projects);
                    if (hydratedProject?.id) {
                        recentProjectIds = pushRecentProject(recentProjectIds, hydratedProject.id);
                    }
                    set({
                        activeProject: hydratedProject,
                        selectedProjectId: hydratedProject?.id || projectId,
                        projects,
                        recentProjectIds,
                        isLoading: false,
                    });
                    return hydratedProject;
                } catch (error) {
                    const actionError = normalizeProjectServiceError(error);
                    set({
                        isLoading: false,
                        // project_locked resolves itself (the other window
                        // gets focused) — stay fully silent, no error banner.
                        error: actionError.code === 'project_locked' ? null : actionError.message,
                        lastProjectActionError: actionError,
                    });
                    return null;
                }
            },

            openProjectFromFolder: async directoryPath => {
                set({ isLoading: true, error: null, lastProjectActionError: null });
                try {
                    const project = await openProjectFromDirectory(directoryPath);
                    if (!project) {
                        set({ isLoading: false });
                        return null;
                    }
                    const projects = await listProjects();
                    const hydratedProject = {
                        ...project,
                        last_active_environment_key:
                            project.last_active_environment_key ||
                            project.default_environment_key ||
                            ENVIRONMENT_KEY.DEVELOPMENT,
                    };
                    set({
                        projects,
                        activeProject: hydratedProject,
                        selectedProjectId: hydratedProject.id,
                        recentProjectIds: pushRecentProject(
                            sanitizeRecentProjects(get().recentProjectIds, projects),
                            hydratedProject.id,
                        ),
                        isLoading: false,
                    });
                    return hydratedProject;
                } catch (error) {
                    const actionError = normalizeProjectServiceError(error);
                    set({
                        isLoading: false,
                        error: actionError.code === 'project_locked' ? null : actionError.message,
                        lastProjectActionError: actionError,
                    });
                    return null;
                }
            },

            createProject: async input => {
                set({ isLoading: true, error: null, lastProjectActionError: null });
                try {
                    const project = await createProject({
                        id: '',
                        slug: '',
                        name: input.name,
                        description: input.description || '',
                        color: input.color || undefined,
                        storage_path: input.storage_path || '',
                        tags: input.tags || [],
                        created_at: '',
                        updated_at: '',
                        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
                        last_active_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
                        layout_state: '',
                        environments: [],
                        assets: [],
                    });
                    const projects = await listProjects();
                    set({
                        projects,
                        activeProject: project,
                        selectedProjectId: project.id,
                        recentProjectIds: pushRecentProject(
                            sanitizeRecentProjects(get().recentProjectIds, projects),
                            project.id,
                        ),
                        isLoading: false,
                    });
                    return project;
                } catch (error) {
                    const actionError = normalizeProjectServiceError(error);
                    set({
                        isLoading: false,
                        error: actionError.message,
                        lastProjectActionError: actionError,
                    });
                    return null;
                }
            },

            saveProject: async project => {
                set({ isLoading: true, error: null, lastProjectActionError: null });
                try {
                    const savedProject = await persistProject(project);
                    set(state => ({
                        projects: patchProjects(state.projects, savedProject),
                        activeProject:
                            state.activeProject?.id === savedProject.id
                                ? savedProject
                                : state.activeProject,
                        selectedProjectId: state.selectedProjectId || savedProject.id,
                        isLoading: false,
                    }));
                    return savedProject;
                } catch (error) {
                    const actionError = normalizeProjectServiceError(error);
                    set({
                        isLoading: false,
                        error: actionError.message,
                        lastProjectActionError: actionError,
                    });
                    return null;
                }
            },

            deleteProject: async (projectId: string) => {
                // Remove optimistically before the async call so any in-flight
                // session-save timer cannot find the project and re-persist it.
                set(state => ({
                    isLoading: true,
                    error: null,
                    lastProjectActionError: null,
                    projects: state.projects.filter(p => p.id !== projectId),
                    activeProject:
                        state.activeProject?.id === projectId ? null : state.activeProject,
                    selectedProjectId:
                        state.selectedProjectId === projectId ? null : state.selectedProjectId,
                    recentProjectIds: state.recentProjectIds.filter(id => id !== projectId),
                }));
                try {
                    await deleteProject(projectId);
                    set({ isLoading: false });
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const restored = await listProjects().catch(() => get().projects);
                    set({ isLoading: false, error: message, projects: restored });
                    return false;
                }
            },

            setProjectEnvironment: async (environmentKey: EnvironmentKey) => {
                const activeProject = get().activeProject;
                if (!activeProject) return null;

                const environments = activeProject.environments?.some(
                    environment => environment.key === environmentKey,
                )
                    ? activeProject.environments
                    : [
                          ...(activeProject.environments || []),
                          buildProjectEnvironment(activeProject.id, environmentKey),
                      ];

                return get().saveProject({
                    ...activeProject,
                    default_environment_key: environmentKey,
                    last_active_environment_key: environmentKey,
                    environments,
                });
            },

            setEnvironmentLastSchema: async (
                environmentKey: EnvironmentKey,
                schemaName: string,
            ) => {
                const activeProject = get().activeProject;
                if (!activeProject) return null;
                const nextSchema = schemaName.trim();
                const hasEnvironment = activeProject.environments?.some(
                    environment => environment.key === environmentKey,
                );
                if (!nextSchema && !hasEnvironment) return activeProject;

                const environments = hasEnvironment
                    ? (activeProject.environments || []).map(environment =>
                          environment.key === environmentKey
                              ? { ...environment, last_schema: nextSchema || undefined }
                              : environment,
                      )
                    : [
                          ...(activeProject.environments || []),
                          {
                              ...buildProjectEnvironment(activeProject.id, environmentKey),
                              last_schema: nextSchema || undefined,
                          },
                      ];

                return get().saveProject({
                    ...activeProject,
                    environments,
                });
            },

            bindEnvironmentConnection: async (
                environmentKey: EnvironmentKey,
                connectionName: string,
                database?: string,
            ) => {
                const activeProject = get().activeProject;
                if (!activeProject) return null;

                const existing = activeProject.environments || [];
                const nextDatabase =
                    database ??
                    existing.find(environment => environment.key === environmentKey)?.last_database;

                const environments = existing.some(
                    environment => environment.key === environmentKey,
                )
                    ? existing.map(environment =>
                          environment.key === environmentKey
                              ? {
                                    ...environment,
                                    connection_ref: connectionName,
                                    last_database: nextDatabase,
                                }
                              : environment,
                      )
                    : [
                          ...existing,
                          {
                              ...buildProjectEnvironment(activeProject.id, environmentKey),
                              connection_ref: connectionName,
                              last_database: nextDatabase,
                          },
                      ];

                return get().saveProject({
                    ...activeProject,
                    default_environment_key: environmentKey,
                    last_active_environment_key: environmentKey,
                    environments,
                });
            },

            patchProject: project =>
                set(state => ({
                    projects: patchProjects(state.projects, project),
                    activeProject:
                        state.activeProject?.id === project.id ? project : state.activeProject,
                })),

            setActiveProject: project =>
                set(state => ({
                    activeProject: project,
                    selectedProjectId: project?.id || null,
                    lastProjectActionError: null,
                    recentProjectIds: project?.id
                        ? pushRecentProject(state.recentProjectIds, project.id)
                        : state.recentProjectIds,
                })),
            clearActiveProject: () => set({ activeProject: null }),
            clearProjectActionError: () => set({ lastProjectActionError: null, error: null }),
            setIsSwitchingProject: value => set({ isSwitchingProject: value }),
        })),
        {
            name: STORAGE_KEY.PROJECT_STORE,
            partialize: state => ({
                selectedProjectId: state.selectedProjectId,
                recentProjectIds: state.recentProjectIds,
            }),
        },
    ),
);
