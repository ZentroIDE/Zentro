// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type { Project } from '../../types/project';
import { toGatewayProject, toProject } from './projectMapper';
import { normalizeProjectServiceError } from './projectServiceError';

export async function listProjects(): Promise<Project[]> {
    return unwrapOrThrow(await getApiGateway().project.listProjects()).map(toProject);
}

export async function getActiveProject(): Promise<Project | null> {
    const result = await getApiGateway().project.getActiveProject();
    // GetActiveProject returns ok:true with data:null when no project is
    // open yet (e.g. a freshly spawned window) — that's not an error case,
    // toProject(null) would throw and abort the rest of bootstrap().
    return result.ok && result.data ? toProject(result.data) : null;
}

export async function openProject(projectId: string): Promise<Project | null> {
    try {
        return toProject(unwrapOrThrow(await getApiGateway().project.openProject(projectId)));
    } catch (error) {
        throw normalizeProjectServiceError(error);
    }
}

export async function createProject(project: Project): Promise<Project> {
    return toProject(
        unwrapOrThrow(await getApiGateway().project.createProject(toGatewayProject(project))),
    );
}

export async function persistProject(project: Project): Promise<Project> {
    return toProject(
        unwrapOrThrow(await getApiGateway().project.saveProject(toGatewayProject(project))),
    );
}

export async function deleteProject(projectId: string): Promise<void> {
    unwrapOrThrow(await getApiGateway().project.deleteProject(projectId));
}

export async function openProjectInNewWindow(projectId: string): Promise<void> {
    try {
        unwrapOrThrow(await getApiGateway().project.openProjectInNewWindow(projectId));
    } catch (error) {
        throw normalizeProjectServiceError(error);
    }
}

export async function getLaunchProjectId(): Promise<string | null> {
    const result = await getApiGateway().project.getLaunchProjectID();
    return result.ok && result.data ? result.data : null;
}

export async function openProjectFromDirectory(directoryPath: string): Promise<Project | null> {
    try {
        return toProject(
            unwrapOrThrow(await getApiGateway().project.openProjectFromDirectory(directoryPath)),
        );
    } catch (error) {
        throw normalizeProjectServiceError(error);
    }
}
