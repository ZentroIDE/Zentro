// SPDX-License-Identifier: GPL-3.0-only

import { appLogger } from '../../lib/logger';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useResultStore } from '../../stores/resultStore';
import { useScriptStore } from '../../stores/scriptStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { createEmptySession, normalizeSession } from '../../stores/editor/sessionUtils';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type { Project } from '../../types/project';
import {
    isSessionEmpty,
    parseProjectEditorSession,
    serializeProjectEditorSession,
    withProjectLayoutState,
} from './projectSessionCodec';

export interface ProjectSessionCoordinatorDeps {
    projectStore?: typeof useProjectStore;
    environmentStore?: typeof useEnvironmentStore;
    connectionStore?: typeof useConnectionStore;
    editorStore?: typeof useEditorStore;
    resultStore?: typeof useResultStore;
    scriptStore?: typeof useScriptStore;
    schemaStore?: typeof useSchemaStore;
    /** Called before every project switch — lets the caller flush any
     *  pending debounced work (e.g. an unsaved session-layout write) for
     *  the outgoing project before this coordinator starts clearing state. */
    onBeforeSwitch?: () => void;
    /** Called whenever this coordinator hydrates a project's session with a
     *  layout it considers already persisted — lets the caller record it
     *  (e.g. into the session-save debounce effect's own last-persisted
     *  tracker) so a redundant save isn't scheduled right after a switch. */
    onSessionHydrated?: (projectId: string, serializedLayout: string) => void;
}

/** Owns the project-switch transaction: the store writes whose sole
 *  trigger is `activeProject.id` changing (session hydration/creation,
 *  environment bootstrap, connection list resync). Everything else that
 *  reacts to connection state independently (auto-reconnect, script/schema
 *  preload) or to component lifecycle (session-save debounce) stays in
 *  useProjectLifecycle. */
export function createProjectSessionCoordinator(deps: ProjectSessionCoordinatorDeps = {}) {
    const projectStore = deps.projectStore ?? useProjectStore;
    const environmentStore = deps.environmentStore ?? useEnvironmentStore;
    const connectionStore = deps.connectionStore ?? useConnectionStore;
    const editorStore = deps.editorStore ?? useEditorStore;
    const resultStore = deps.resultStore ?? useResultStore;
    const scriptStore = deps.scriptStore ?? useScriptStore;
    const schemaStore = deps.schemaStore ?? useSchemaStore;
    const onBeforeSwitch = deps.onBeforeSwitch;
    const onSessionHydrated = deps.onSessionHydrated;

    const migratedProjects = new Set<string>();

    function clearForNoProject() {
        environmentStore.getState().clear();
        // Connections were already reset by syncProjectConnections's null-project branch.
        editorStore.getState().switchProject(null);
        resultStore.getState().switchProject(null);
        scriptStore.getState().clearScope();
        schemaStore.getState().resetAll();
    }

    function switchToProject(project: Project) {
        editorStore.getState().switchProject(project.id);
        resultStore.getState().switchProject(project.id);
        scriptStore.getState().clearScope();
        // A stale reconnect race (or simply this project's environment
        // reusing another project's connection profile:db key) must never
        // let the explorer render a tree fetched for a different project's
        // connection — force a fresh fetch for whatever connects next.
        schemaStore.getState().resetAll();

        const sessionFromProject = parseProjectEditorSession(project.layout_state);
        const fallbackSession = normalizeSession(
            editorStore.getState().projectSessions[project.id],
        );

        if (sessionFromProject) {
            editorStore.getState().hydrateProjectSession(project.id, sessionFromProject, true);
            onSessionHydrated?.(project.id, serializeProjectEditorSession(sessionFromProject));
        } else if (!isSessionEmpty(fallbackSession)) {
            editorStore.getState().hydrateProjectSession(project.id, fallbackSession, true);
            const serialized = serializeProjectEditorSession(fallbackSession);
            onSessionHydrated?.(project.id, serialized);

            if (!migratedProjects.has(project.id)) {
                migratedProjects.add(project.id);
                void projectStore
                    .getState()
                    .saveProject(withProjectLayoutState(project, serialized));
            }
        } else {
            editorStore.getState().hydrateProjectSession(project.id, createEmptySession(), true);
            const currentSession = normalizeSession(
                editorStore.getState().projectSessions[project.id],
            );
            if (isSessionEmpty(currentSession)) {
                editorStore.getState().addTab({ name: 'New Query', query: '' });
            }
        }

        environmentStore.getState().bootstrap(project);
    }

    function syncProjectConnections(project: Project | null): () => void {
        if (!project?.id) {
            connectionStore.getState().setConnections([]);
            return () => {};
        }

        let cancelled = false;
        connectionStore.getState().setConnections([]);

        void (async () => {
            try {
                const connections = unwrapOrThrow(
                    await getApiGateway().connection.loadConnections(),
                );
                if (cancelled) return;
                connectionStore.getState().setConnections(connections || []);
            } catch (error) {
                if (cancelled) return;
                appLogger.warn('project connection reload failed', {
                    projectId: project.id,
                    error,
                });
                connectionStore.getState().setConnections([]);
            }
        })();

        return () => {
            cancelled = true;
        };
    }

    function handleProjectChange(project: Project | null): () => void {
        onBeforeSwitch?.();
        const cancelSync = syncProjectConnections(project);

        if (project) {
            switchToProject(project);
        } else {
            clearForNoProject();
        }

        return cancelSync;
    }

    return {
        /** Starts the transaction for the current project and subscribes
         *  to future switches. Returns a stop function that cancels any
         *  in-flight connection sync and unsubscribes. */
        start(): () => void {
            let cancelSync = handleProjectChange(projectStore.getState().activeProject);

            const unsubscribe = projectStore.subscribe((state, prevState) => {
                if (state.activeProject?.id === prevState.activeProject?.id) return;
                cancelSync();
                cancelSync = handleProjectChange(state.activeProject);
            });

            return () => {
                cancelSync();
                unsubscribe();
            };
        },
    };
}
