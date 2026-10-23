// SPDX-License-Identifier: GPL-3.0-only

import type { StateCreator } from 'zustand';
import type { ResultState } from './types';
import { DEFAULT_WORKSPACE_ID, getProjectId, createEmptyBucket } from './types';

export interface ResultProjectSlice {
    switchProject: (projectId: string | null) => void;
    clearProject: (projectId?: string | null) => void;
}

export const createResultProjectSlice: StateCreator<
    ResultState,
    [],
    [],
    ResultProjectSlice
> = set => ({
    switchProject: projectId =>
        set(state => {
            const nextProjectId = getProjectId(projectId);
            const results = state.projectResults[nextProjectId] || createEmptyBucket();

            return {
                projectResults: {
                    ...state.projectResults,
                    [nextProjectId]: results,
                },
                activeProjectId: nextProjectId,
                results,
            };
        }),

    clearProject: projectId =>
        set(state => {
            const nextProjectId = getProjectId(projectId || state.activeProjectId);
            const projectResults = {
                ...state.projectResults,
                [nextProjectId]: createEmptyBucket(),
            };
            const isActive = nextProjectId === getProjectId(state.activeProjectId);

            return {
                projectResults,
                ...(isActive ? { results: projectResults[nextProjectId] } : {}),
            };
        }),
});
