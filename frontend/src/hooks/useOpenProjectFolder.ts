// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useProjectStore } from '../stores/projectStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useToast } from '../components/layout/Toast';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import { emitCommand } from '../lib/commandBus';
import { CONNECTION_STATUS, DOM_EVENT } from '../lib/constants';
import { ProjectHubSurface, ProjectWizardMode } from '../lib/enums';
import type { Project } from '../types/project';

/**
 * "Open Project Folder…": picks a directory and opens it as an existing Zentro
 * project (one that already has a project.json). A folder that isn't a project
 * is never initialised — the toast offers to create a new project instead.
 * Mirrors useOpenProject's switch transaction so a live connection is torn
 * down before the new project activates.
 */
export function useOpenProjectFolder() {
    const openProjectFromFolder = useProjectStore(s => s.openProjectFromFolder);
    const connectionStatus = useConnectionStore(s => s.connectionStatus);
    const resetRuntime = useConnectionStore(s => s.resetRuntime);
    const { toast } = useToast();

    const openProjectFolder = useCallback(async (): Promise<Project | null> => {
        let directory = '';
        try {
            directory = unwrapOrThrow(await getApiGateway().project.pickDirectory(''));
        } catch (error) {
            toast.error(`Could not open the folder picker: ${error}`);
            return null;
        }
        if (!directory) return null;

        useProjectStore.getState().setIsSwitchingProject(true);
        try {
            if (connectionStatus !== CONNECTION_STATUS.DISCONNECTED) {
                await getApiGateway().connection.disconnect();
            }
            const project = await openProjectFromFolder(directory);
            resetRuntime();
            if (project) return project;

            const actionError = useProjectStore.getState().lastProjectActionError;
            // project_locked: the other window was focused server-side — stay silent.
            if (actionError?.code === 'project_locked') return null;
            if (actionError?.code === 'project_limit_reached') {
                emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                    surface: ProjectHubSurface.WIZARD,
                    wizardMode: ProjectWizardMode.CREATE,
                    showProjectLimitUpgrade: true,
                });
                return null;
            }
            if (actionError?.code === 'not_a_project') {
                toast.error('That folder is not a Zentro project.', {
                    important: true,
                    source: 'project.openFolder',
                    actions: [
                        {
                            id: 'create-project',
                            label: 'Create new project',
                            run: () =>
                                emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                                    surface: ProjectHubSurface.WIZARD,
                                    wizardMode: ProjectWizardMode.CREATE,
                                }),
                        },
                    ],
                });
                return null;
            }
            toast.error(`Could not open project: ${actionError?.message ?? 'unknown error'}`, {
                important: true,
                source: 'project.openFolder',
            });
            return null;
        } catch (error) {
            resetRuntime();
            toast.error(`Could not open project: ${error}`, {
                important: true,
                source: 'project.openFolder',
            });
            return null;
        } finally {
            useProjectStore.getState().setIsSwitchingProject(false);
        }
    }, [connectionStatus, openProjectFromFolder, resetRuntime, toast]);

    return { openProjectFolder };
}
