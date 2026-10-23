// SPDX-License-Identifier: GPL-3.0-only

import { useState } from 'react';
import type { ContextSearchIntent, ProjectHubLaunchIntent } from '../lib/constants';

export interface AppDialogState {
    showForceQuitConfirm: boolean;
    setShowForceQuitConfirm: (open: boolean) => void;
    showProjectHub: boolean;
    setShowProjectHub: (open: boolean) => void;
    projectHubLaunchIntent: ProjectHubLaunchIntent | undefined;
    setProjectHubLaunchIntent: (intent: ProjectHubLaunchIntent | undefined) => void;
    contextSearchIntent: ContextSearchIntent | null;
    setContextSearchIntent: (intent: ContextSearchIntent | null) => void;
}

export function useAppDialogState(): AppDialogState {
    const [showForceQuitConfirm, setShowForceQuitConfirm] = useState(false);
    const [showProjectHub, setShowProjectHub] = useState(false);
    const [projectHubLaunchIntent, setProjectHubLaunchIntent] = useState<
        ProjectHubLaunchIntent | undefined
    >(undefined);
    const [contextSearchIntent, setContextSearchIntent] = useState<ContextSearchIntent | null>(
        null,
    );

    return {
        showForceQuitConfirm,
        setShowForceQuitConfirm,
        showProjectHub,
        setShowProjectHub,
        projectHubLaunchIntent,
        setProjectHubLaunchIntent,
        contextSearchIntent,
        setContextSearchIntent,
    };
}
