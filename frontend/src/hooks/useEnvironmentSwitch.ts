// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useProjectStore } from '../stores/projectStore';
import { useEnvironmentStore } from '../stores/environmentStore';
import { useToast } from '../components/layout/Toast';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../shared/kernel';
import type { EnvironmentKey } from '../types/project';

/**
 * Switches the active project environment: reconnects the backend session to
 * the target environment's connection FIRST (so the session's real DB handle
 * and env key actually flip), then flips the store + persists the project's
 * last-active env. Reconnecting first (rather than relying on the
 * best-effort auto-reconnect effect in useProjectLifecycle) prevents the FE
 * from showing an environment the backend never actually connected to, which
 * previously desynced write-safety prompts and audit-log entries from the
 * database a query really ran against. Shared by the toolbar's
 * QuickEnvPopover and the Spotlight palette's `@env` mode. Returns whether
 * the switch happened.
 */
export function useEnvironmentSwitch() {
    const activeProject = useProjectStore(s => s.activeProject);
    const setProjectEnvironment = useProjectStore(s => s.setProjectEnvironment);
    const activeEnvironmentKey = useEnvironmentStore(s => s.activeEnvironmentKey);
    const setActiveEnvironment = useEnvironmentStore(s => s.setActiveEnvironment);
    const setIsSwitching = useEnvironmentStore(s => s.setIsSwitching);
    const { toast } = useToast();

    const switchEnvironment = useCallback(
        async (envKey: EnvironmentKey): Promise<boolean> => {
            if (!activeProject || envKey === activeEnvironmentKey) return false;
            // Held for the whole operation, not just the backend call: the
            // backend's Connecting/Connected events flip
            // connectionStore.activeProfile to the new target before
            // setActiveEnvironment below flips activeEnvironmentKey to
            // match, and useProjectLifecycle's auto-reconnect effect must
            // not act on that in-between mismatch (see environmentStore.ts
            // and useProjectLifecycle.test.ts).
            setIsSwitching(true);
            try {
                const connected = await getApiGateway().project.connectProjectEnvironment(envKey);
                if (!connected.ok) {
                    toast.error(
                        `Could not switch environment: ${kernelErrorMessage(connected.error)}`,
                    );
                    return false;
                }
                setActiveEnvironment(envKey);
                const updated = await setProjectEnvironment(envKey);
                if (updated) return true;
                toast.error('Could not switch environment.');
            } catch (error) {
                toast.error(`Could not switch environment: ${error}`);
            } finally {
                setIsSwitching(false);
            }
            return false;
        },
        [
            activeProject,
            activeEnvironmentKey,
            setActiveEnvironment,
            setIsSwitching,
            setProjectEnvironment,
            toast,
        ],
    );

    return { switchEnvironment, activeEnvironmentKey, activeProject };
}
