// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { ProjectAdapter } from '../contracts/project';
import type { RestHttpClient } from './httpClient';
import type { models } from '../../../../wailsjs/go/models';

export function createProjectRestAdapter(client: RestHttpClient): ProjectAdapter {
    return withKernelResult('project', {
        listProjects: () => client.call<models.Project[]>('/project/list-projects'),
        getProject: (projectId: string) =>
            client.call<models.Project>('/project/get-project', { projectId }),
        createProject: (project: models.Project) =>
            client.call<models.Project>('/project/create-project', { project }),
        saveProject: (project: models.Project) =>
            client.call<models.Project>('/project/save-project', { project }),
        deleteProject: (projectId: string) =>
            client.call<void>('/project/delete-project', { projectId }),
        openProject: (projectId: string) =>
            client.call<models.Project>('/project/open-project', { projectId }),
        openProjectInNewWindow: (projectId: string) =>
            client.call<void>('/project/open-project-in-new-window', { projectId }),
        getLaunchProjectID: () => client.call<string>('/project/get-launch-project-id'),
        openProjectFromDirectory: (directoryPath: string) =>
            client.call<models.Project>('/project/open-project-from-directory', {
                directoryPath,
            }),
        getActiveProject: () => client.call<models.Project>('/project/get-active-project'),
        getDefaultProjectStorageRoot: () =>
            client.call<string>('/project/get-default-storage-root'),
        pickDirectory: (initialPath: string) =>
            client.call<string>('/project/pick-directory', { initialPath }),
        openDirectoryInExplorer: (path: string) =>
            client.call<void>('/project/open-directory-in-explorer', { path }),
        openFileInDefaultApp: (path: string) =>
            client.call<void>('/project/open-file-in-default-app', { path }),
        forceQuit: () => client.call<void>('/project/force-quit'),
        connectProjectEnvironment: (environmentKey: string) =>
            client.call<void>('/project/connect-project-environment', { environmentKey }),
    });
}
