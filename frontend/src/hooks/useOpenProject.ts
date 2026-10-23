// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useProjectStore } from '../stores/projectStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useToast } from '../components/layout/Toast';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { CONNECTION_STATUS } from '../lib/constants';
import type { Project } from '../types/project';

/**
 * Opens a project: disconnects any live session first, hands off to
 * projectStore.openProject, then resets connection runtime state. Shared by
 * the full Project Hub list and the toolbar's QuickProjectPopover so both
 * surfaces handle the locked-project / error cases identically (a locked
 * project focuses the other window server-side and stays silent here; any
 * other failure surfaces a toast).
 */
export function useOpenProject() {
    const openProjectInStore = useProjectStore(s => s.openProject);
    const connectionStatus = useConnectionStore(s => s.connectionStatus);
    const resetRuntime = useConnectionStore(s => s.resetRuntime);
    const { toast } = useToast();

    const openProject = useCallback(
        async (projectId: string): Promise<Project | null> => {
            // Set before the disconnect below: disconnecting fires a
            // Disconnected event that would otherwise re-trigger
            // useProjectLifecycle's auto-reconnect effect while activeProject
            // still refers to the outgoing project, reconnecting to its
            // environment instead of the one being switched to.
            useProjectStore.getState().setIsSwitchingProject(true);
            try {
                if (connectionStatus !== CONNECTION_STATUS.DISCONNECTED) {
                    await getApiGateway().connection.disconnect();
                }
                const project = await openProjectInStore(projectId);
                if (!project) {
                    resetRuntime();
                    const actionError = useProjectStore.getState().lastProjectActionError;
                    if (actionError && actionError.code !== 'project_locked') {
                        toast.error(`Could not open project: ${actionError.message}`, {
                            important: true,
                            source: 'project.open',
                            dedupeKey: `project-open:${projectId}`,
                        });
                    }
                    return null;
                }
                resetRuntime();
                return project;
            } catch (error) {
                resetRuntime();
                toast.error(`Could not open project: ${error}`, {
                    important: true,
                    source: 'project.open',
                    dedupeKey: `project-open:${projectId}`,
                });
                return null;
            } finally {
                useProjectStore.getState().setIsSwitchingProject(false);
            }
        },
        [connectionStatus, openProjectInStore, resetRuntime, toast],
    );

    return { openProject };
}
