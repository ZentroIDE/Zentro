// SPDX-License-Identifier: GPL-3.0-only

export { ProjectServiceError, normalizeProjectServiceError } from './projectServiceError';
export type { ProjectServiceErrorCode } from './projectServiceError';

export {
    toProject,
    toGatewayProject,
    normalizeProjectEnvironment,
    toEnvironmentKey,
} from './projectMapper';

export {
    listProjects,
    getActiveProject,
    openProject,
    openProjectInNewWindow,
    getLaunchProjectId,
    createProject,
    persistProject,
    deleteProject,
    openProjectFromDirectory,
} from './projectGateway';
