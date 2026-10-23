// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { withStoreLogger } from './logger';
import type { EnvironmentKey, Project, ProjectEnvironment } from '../types/project';
import { getEnvironmentLabel, getEnvironmentOrderIndex } from '../lib/projects';
import { ENVIRONMENT_KEY } from '../lib/constants';

interface EnvironmentState {
    environments: ProjectEnvironment[];
    activeEnvironmentKey: EnvironmentKey | null;
    // True for the whole span of an explicit useEnvironmentSwitch call —
    // from before the backend connect starts until activeEnvironmentKey
    // itself has been updated to match. connectionStore.activeProfile flips
    // to the new target as soon as the backend's Connecting/Connected
    // events land, but activeEnvironmentKey only flips once the switch
    // fully resolves, so there's an unavoidable window where the two
    // disagree. useProjectLifecycle's auto-reconnect effect must not act
    // during that window — see the regression test in
    // useProjectLifecycle.test.ts for the race this prevents.
    isSwitching: boolean;

    bootstrap: (project: Project | null) => void;
    setActiveEnvironment: (key: EnvironmentKey | null) => void;
    setIsSwitching: (value: boolean) => void;
    clear: () => void;
}

function buildFallbackEnvironment(project: Project): ProjectEnvironment {
    const key = project.default_environment_key || ENVIRONMENT_KEY.DEVELOPMENT;
    return {
        id: `${project.id}:${key}`,
        project_id: project.id,
        key,
        label: getEnvironmentLabel(key),
        is_protected: key === ENVIRONMENT_KEY.STAGING || key === ENVIRONMENT_KEY.PRODUCTION,
        is_read_only: key === ENVIRONMENT_KEY.PRODUCTION,
    };
}

export const useEnvironmentStore = create<EnvironmentState>()(
    withStoreLogger('environmentStore', set => ({
        environments: [],
        activeEnvironmentKey: null,
        isSwitching: false,

        bootstrap: project => {
            if (!project) {
                set({ environments: [], activeEnvironmentKey: null });
                return;
            }

            const environments = (
                project.environments?.length
                    ? project.environments
                    : [buildFallbackEnvironment(project)]
            )
                .slice()
                .sort((a, b) => getEnvironmentOrderIndex(a.key) - getEnvironmentOrderIndex(b.key));

            const requestedKey =
                project.last_active_environment_key ||
                project.default_environment_key ||
                environments[0]?.key ||
                ENVIRONMENT_KEY.DEVELOPMENT;
            const activeEnvironmentKey = environments.some(
                environment => environment.key === requestedKey,
            )
                ? requestedKey
                : environments[0]?.key || null;

            set({
                environments,
                activeEnvironmentKey,
            });
        },

        setActiveEnvironment: key =>
            set(state => {
                if (!key) {
                    return { activeEnvironmentKey: null };
                }

                return { activeEnvironmentKey: key };
            }),

        setIsSwitching: value => set({ isSwitching: value }),

        clear: () => set({ environments: [], activeEnvironmentKey: null, isSwitching: false }),
    })),
);
