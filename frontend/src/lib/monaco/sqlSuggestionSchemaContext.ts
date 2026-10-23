// SPDX-License-Identifier: GPL-3.0-only

import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import type { EnvironmentKey, Project } from '../../types/project';
import {
    recordCompletionAcceptance,
    type SqlCompletionAcceptance,
    type SqlCompletionSuggestionKind,
} from './sqlCompletionMemory';

export const SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID = 'zentro.sql.completion.tableSelected';
export const SQL_COMPLETION_ACCEPTED_COMMAND_ID = SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID;

type SqlCompletionSchemaPayload = {
    schemaName?: string;
    suggestionKey?: string;
    suggestionKind?: SqlCompletionSuggestionKind;
    contextBucket?: string;
};

export function applySqlCompletionAcceptance(
    project: Project,
    activeEnvironmentKey: EnvironmentKey | undefined,
    payload: SqlCompletionSchemaPayload,
): Project | null {
    const schemaName = (payload.schemaName || '').trim();
    const environments =
        schemaName && activeEnvironmentKey
            ? (project.environments || []).map(environment =>
                  environment.key === activeEnvironmentKey
                      ? { ...environment, last_schema: schemaName }
                      : environment,
              )
            : project.environments;
    const hasAcceptance =
        typeof payload.suggestionKey === 'string' &&
        payload.suggestionKey.length > 0 &&
        typeof payload.suggestionKind === 'string' &&
        typeof payload.contextBucket === 'string' &&
        payload.contextBucket.length > 0;
    const completionMemory = hasAcceptance
        ? recordCompletionAcceptance(project.completion_memory, {
              suggestionKey: payload.suggestionKey!,
              suggestionKind: payload.suggestionKind!,
              contextBucket: payload.contextBucket!,
          } satisfies SqlCompletionAcceptance)
        : project.completion_memory;

    if (!schemaName && !hasAcceptance) return null;
    return {
        ...project,
        environments,
        completion_memory: completionMemory,
    };
}

type DisposableLike = {
    dispose: () => void;
};

type SqlSuggestionMonacoApi = {
    editor: {
        registerCommand: (
            id: string,
            handler: (accessor: unknown, ...args: unknown[]) => void,
        ) => DisposableLike;
    };
};

const DISPOSABLE_KEY = '__ZENTRO_SQL_COMPLETION_SCHEMA_COMMAND__';
type SqlSuggestionWindow = Window & { [DISPOSABLE_KEY]?: DisposableLike };

function getStoredDisposable() {
    return (window as SqlSuggestionWindow)[DISPOSABLE_KEY];
}

function setStoredDisposable(disposable?: DisposableLike) {
    (window as SqlSuggestionWindow)[DISPOSABLE_KEY] = disposable;
}

let persistenceQueue = Promise.resolve();

function enqueueAcceptancePersistence(payload: SqlCompletionSchemaPayload): void {
    persistenceQueue = persistenceQueue
        .then(async () => {
            const projectStore = useProjectStore.getState();
            const activeProject = projectStore.activeProject;
            if (!activeProject) return;

            const activeEnvironmentKey =
                useEnvironmentStore.getState().activeEnvironmentKey ||
                activeProject.default_environment_key;
            const nextProject = applySqlCompletionAcceptance(
                activeProject,
                activeEnvironmentKey,
                payload,
            );
            if (!nextProject) return;
            projectStore.patchProject(nextProject);
            await useProjectStore.getState().saveProject(nextProject);
        })
        .catch(error => {
            console.error('Unable to persist SQL completion acceptance:', error);
        });
}

export function registerSqlCompletionSchemaContextCommand(monaco: SqlSuggestionMonacoApi) {
    if (getStoredDisposable()) return;

    const disposable = monaco.editor.registerCommand(
        SQL_COMPLETION_TABLE_SELECTED_COMMAND_ID,
        (_accessor, ...args) => {
            const payload =
                args[0] && typeof args[0] === 'object'
                    ? (args[0] as SqlCompletionSchemaPayload)
                    : undefined;
            if (!payload) return;
            enqueueAcceptancePersistence(payload);
        },
    );

    setStoredDisposable(disposable);
}
