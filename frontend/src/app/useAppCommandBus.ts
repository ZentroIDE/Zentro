// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import {
    DOM_EVENT,
    type ContextSearchIntent,
    type EnvironmentKey,
    type ProjectHubLaunchIntent,
} from '../lib/constants';
import { ProjectHubLaunchContext, ProjectHubSurface, ProjectWizardMode } from '../lib/enums';
import { onCommand } from '../lib/commandBus';
import { useOpenProjectFolder } from '../hooks/useOpenProjectFolder';
import { revealAndFocusZone } from '../lib/focusZoneReveal';

interface AppCommandBusOptions {
    activeEnvironmentKey?: EnvironmentKey | null;
    activeProject?: {
        id?: string;
        default_environment_key?: EnvironmentKey;
    } | null;
    addCompareTab: () => void;
    setContextSearchIntent: (intent: ContextSearchIntent | null) => void;
    setProjectHubLaunchIntent: (intent: ProjectHubLaunchIntent | undefined) => void;
    setShowProjectHub: (open: boolean) => void;
}

export function useAppCommandBus({
    activeEnvironmentKey,
    activeProject,
    addCompareTab,
    setContextSearchIntent,
    setProjectHubLaunchIntent,
    setShowProjectHub,
}: AppCommandBusOptions) {
    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_SCHEMA_DIFF, () => {
            addCompareTab();
        });
        return off;
    }, [addCompareTab]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_PROJECT_HUB, intent => {
            setProjectHubLaunchIntent(intent);
            setShowProjectHub(true);
        });
        return off;
    }, [setProjectHubLaunchIntent, setShowProjectHub]);

    const { openProjectFolder } = useOpenProjectFolder();
    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_PROJECT_FOLDER, () => {
            void openProjectFolder();
        });
        return off;
    }, [openProjectFolder]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_ENVIRONMENT_SWITCHER, () => {
            if (!activeProject?.id) {
                setProjectHubLaunchIntent(undefined);
                setShowProjectHub(true);
                return;
            }

            setProjectHubLaunchIntent({
                surface: ProjectHubSurface.WIZARD,
                wizardMode: ProjectWizardMode.EDIT,
                launchContext: ProjectHubLaunchContext.ENV_CONFIG,
                projectId: activeProject.id,
                initialEnvironmentKey:
                    activeEnvironmentKey || activeProject.default_environment_key,
            });
            setShowProjectHub(true);
        });
        return off;
    }, [
        activeEnvironmentKey,
        activeProject?.default_environment_key,
        activeProject?.id,
        setProjectHubLaunchIntent,
        setShowProjectHub,
    ]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, intent => {
            setContextSearchIntent(intent || {});
        });
        return off;
    }, [setContextSearchIntent]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.OPEN_COMMAND_PALETTE, () => {
            setContextSearchIntent({ initialQuery: '>' });
        });
        return off;
    }, [setContextSearchIntent]);

    useEffect(() => {
        const off = onCommand(DOM_EVENT.FOCUS_ZONE, payload => {
            if (!payload?.zoneId) return;
            revealAndFocusZone(payload.zoneId);
        });
        return off;
    }, []);
}
