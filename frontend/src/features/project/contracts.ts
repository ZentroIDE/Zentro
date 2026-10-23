// SPDX-License-Identifier: GPL-3.0-only

import type { Project } from '../../types/project';

export interface ProjectFeatureApi {
    listProjects(): Promise<Project[]>;
    openProject(projectId: string): Promise<Project>;
    saveProject(project: Project): Promise<Project>;
}
