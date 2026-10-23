// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface ProjectAdapter {
    listProjects(): Promise<KernelResult<models.Project[]>>;
    getProject(projectId: string): Promise<KernelResult<models.Project>>;
    createProject(project: models.Project): Promise<KernelResult<models.Project>>;
    saveProject(project: models.Project): Promise<KernelResult<models.Project>>;
    deleteProject(projectId: string): Promise<KernelResult<void>>;
    openProject(projectId: string): Promise<KernelResult<models.Project>>;
    openProjectInNewWindow(projectId: string): Promise<KernelResult<void>>;
    getLaunchProjectID(): Promise<KernelResult<string>>;
    openProjectFromDirectory(directoryPath: string): Promise<KernelResult<models.Project>>;
    getActiveProject(): Promise<KernelResult<models.Project>>;
    getDefaultProjectStorageRoot(): Promise<KernelResult<string>>;
    pickDirectory(initialPath: string): Promise<KernelResult<string>>;
    openDirectoryInExplorer(path: string): Promise<KernelResult<void>>;
    openFileInDefaultApp(path: string): Promise<KernelResult<void>>;
    forceQuit(): Promise<KernelResult<void>>;
    connectProjectEnvironment(environmentKey: string): Promise<KernelResult<void>>;
}
