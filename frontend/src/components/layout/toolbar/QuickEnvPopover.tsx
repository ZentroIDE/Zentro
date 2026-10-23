// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProjectStore } from '../../../stores/projectStore';
import { useEnvironmentStore } from '../../../stores/environmentStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import {
    getEnvironmentMeta,
    getEnvironmentShortLabel,
    sortEnvironmentKeys,
} from '../../../lib/projects';
import { getProvider } from '../../../lib/providers';
import { DOM_EVENT } from '../../../lib/constants';
import { ProjectHubSurface, ProjectWizardMode, ProjectHubLaunchContext } from '../../../lib/enums';
import { emitCommand, onCommand } from '../../../lib/commandBus';
import type { EnvironmentKey } from '../../../types/project';
import { Button, Popover, PopoverAnchor, PopoverContent } from '../../ui';
import { EnvironmentBadge } from '../../shared/EnvironmentBadge';
import { interactiveSelected, interactiveSurface } from '../../ui/contract';
import { useEnvironmentSwitch } from '../../../hooks/useEnvironmentSwitch';
import { cn } from '../../../lib/cn';

const QUICK_ENV_CLOSE_DELAY_MS = 120;

/**
 * QuickEnvPopover renders the environment-switch trigger badge and its hover
 * popover. Owns the hover-timer ref (cleared on unmount), the open/closed
 * state, and the per-environment connection-detail derivations. On click
 * without project it opens the project hub; with project it opens the wizard
 * in edit mode. On hover it shows the list of bound envs; selecting one calls
 * `setActiveEnvironment` + `setProjectEnvironment`.
 */
export const QuickEnvPopover: React.FC = () => {
    const activeProject = useProjectStore(s => s.activeProject);
    const activeEnvironmentKey = useEnvironmentStore(s => s.activeEnvironmentKey);
    const activeProfile = useConnectionStore(s => s.activeProfile);
    const poolConnections = useConnectionStore(s => s.connections);
    const { switchEnvironment } = useEnvironmentSwitch();

    const activeEnvKey = (activeEnvironmentKey || activeProject?.default_environment_key) as
        | EnvironmentKey
        | undefined;
    const envMeta = getEnvironmentMeta(
        activeEnvironmentKey || activeProject?.default_environment_key,
    );

    const [quickEnvOpen, setQuickEnvOpen] = useState(false);
    const quickEnvCloseTimerRef = useRef<number | null>(null);

    const quickEnvOptions = useMemo(() => {
        const orderedKeys: EnvironmentKey[] = [];
        const seen = new Set<EnvironmentKey>();
        const pushKey = (key?: EnvironmentKey | null) => {
            if (!key || seen.has(key)) return;
            seen.add(key);
            orderedKeys.push(key);
        };

        // Quick switch popover should only list environments already bound to a connection.
        (activeProject?.environments || []).forEach(environment => {
            if (environment.connection_ref) {
                pushKey(environment.key);
            }
        });

        return sortEnvironmentKeys(orderedKeys);
    }, [activeProject?.environments]);

    const quickEnvConnectionDetails = useMemo(() => {
        const byKey = new Map<
            EnvironmentKey,
            { name: string; database: string; host: string; port?: number; driver: string }
        >();
        quickEnvOptions.forEach(envKey => {
            const envModel = activeProject?.environments?.find(env => env.key === envKey);
            // connection_ref is a pool connection ID (not its display name).
            const poolConnection = poolConnections.find(
                connection => connection.id === envModel?.connection_ref,
            );
            const isActive = envKey === activeEnvKey;

            const name =
                (isActive ? activeProfile?.name : undefined) ||
                poolConnection?.name ||
                (envModel?.connection_ref ? 'Connection not found' : 'No connection');
            const database =
                (isActive ? activeProfile?.db_name : undefined) ||
                envModel?.last_database ||
                'No DB';
            const host =
                (isActive ? activeProfile?.host : undefined) || poolConnection?.host || 'No host';
            const port = (isActive ? activeProfile?.port : undefined) ?? poolConnection?.port;
            const driver =
                (isActive ? activeProfile?.driver : undefined) || poolConnection?.driver || '';

            byKey.set(envKey, { name, database, host, port, driver });
        });
        return byKey;
    }, [
        activeEnvKey,
        activeProfile?.db_name,
        activeProfile?.driver,
        activeProfile?.host,
        activeProfile?.name,
        activeProfile?.port,
        activeProject?.environments,
        poolConnections,
        quickEnvOptions,
    ]);

    const clearQuickEnvCloseTimer = useCallback(() => {
        if (quickEnvCloseTimerRef.current === null) return;
        window.clearTimeout(quickEnvCloseTimerRef.current);
        quickEnvCloseTimerRef.current = null;
    }, []);

    const openQuickEnv = useCallback(() => {
        clearQuickEnvCloseTimer();
        setQuickEnvOpen(true);
    }, [clearQuickEnvCloseTimer]);

    const scheduleQuickEnvClose = useCallback(() => {
        clearQuickEnvCloseTimer();
        quickEnvCloseTimerRef.current = window.setTimeout(() => {
            setQuickEnvOpen(false);
            quickEnvCloseTimerRef.current = null;
        }, QUICK_ENV_CLOSE_DELAY_MS);
    }, [clearQuickEnvCloseTimer]);

    useEffect(() => () => clearQuickEnvCloseTimer(), [clearQuickEnvCloseTimer]);

    // Alt+Shift+E (connection.openEnvironmentSwitcher) toggles this popover
    // open the same way hovering the trigger does, for keyboard-only quick switch.
    useEffect(
        () =>
            onCommand(DOM_EVENT.QUICK_SWITCH_ENVIRONMENT, () => {
                if (!activeProject) return;
                setQuickEnvOpen(current => {
                    if (current) return false;
                    clearQuickEnvCloseTimer();
                    return true;
                });
            }),
        [activeProject, clearQuickEnvCloseTimer],
    );

    const handleQuickSwitchEnv = async (envKey: EnvironmentKey) => {
        setQuickEnvOpen(false);
        await switchEnvironment(envKey);
    };

    return (
        <Popover open={quickEnvOpen} onOpenChange={setQuickEnvOpen}>
            <PopoverAnchor asChild className='mx-1'>
                <Button
                    type='button'
                    variant='ghost'
                    className='h-6 w-full! mx-0! border-none!  shrink-0 flex items-center transition-colors'
                    title={`Current environment: ${envMeta.label}. Hover to quick switch, click to configure bindings.`}
                    onMouseEnter={() => openQuickEnv()}
                    onMouseLeave={scheduleQuickEnvClose}
                    onFocus={() => openQuickEnv()}
                    onBlur={scheduleQuickEnvClose}
                    onClick={() => {
                        setQuickEnvOpen(false);
                        if (!activeProject?.id) {
                            emitCommand(DOM_EVENT.OPEN_PROJECT_HUB);
                            return;
                        }
                        emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                            surface: ProjectHubSurface.WIZARD,
                            wizardMode: ProjectWizardMode.EDIT,
                            launchContext: ProjectHubLaunchContext.ENV_CONFIG,
                            projectId: activeProject.id,
                            initialEnvironmentKey:
                                activeEnvironmentKey || activeProject.default_environment_key,
                        });
                    }}
                >
                    {activeProject && (
                        <EnvironmentBadge
                            label={getEnvironmentShortLabel(
                                activeEnvironmentKey || activeProject.default_environment_key,
                            )}
                            toneClassName={envMeta.colorClass}
                            className='h-6! w-full rounded-l-none! rounded-sm'
                            title={envMeta.description}
                        />
                    )}
                </Button>
            </PopoverAnchor>
            {activeProject && (
                <PopoverContent
                    align='center'
                    side='bottom'
                    sideOffset={8}
                    className='z-dropdown w-80 max-w-xl rounded-md p-2 shadow-sm'
                    onMouseEnter={clearQuickEnvCloseTimer}
                    onMouseLeave={scheduleQuickEnvClose}
                >
                    <div className='mb-2 text-center font-semibold text-muted-foreground'>
                        Environments
                    </div>
                    <div className='space-y-1'>
                        {quickEnvOptions.map(envKey => {
                            const meta = getEnvironmentMeta(envKey);
                            const isActive =
                                envKey ===
                                (activeEnvironmentKey || activeProject.default_environment_key);
                            const details = quickEnvConnectionDetails.get(envKey);
                            const provider = details?.driver ? getProvider(details.driver) : null;
                            return (
                                <Button
                                    key={envKey}
                                    type='button'
                                    variant='ghost'
                                    className={cn(
                                        'h-auto w-full justify-start border-none! gap-2.5 rounded-md px-2 py-2 text-left',
                                        isActive ? interactiveSelected : interactiveSurface,
                                    )}
                                    onClick={() => {
                                        void handleQuickSwitchEnv(envKey);
                                    }}
                                >
                                    <EnvironmentBadge
                                        label={getEnvironmentShortLabel(envKey)}
                                        toneClassName={meta.colorClass}
                                        title={meta.description}
                                        className='shrink-0'
                                    />
                                    {provider && (
                                        <img
                                            src={provider.icon}
                                            alt=''
                                            className='h-4 w-4 shrink-0 object-contain'
                                        />
                                    )}
                                    <span className='flex min-w-0 flex-1 flex-col leading-tight'>
                                        <span className='truncate text-small font-semibold text-foreground'>
                                            {details?.name || 'No connection'}
                                            <span className='mx-1 font-normal text-muted-foreground/60'>
                                                /
                                            </span>
                                            <span className='font-normal text-muted-foreground'>
                                                {details?.database || 'No DB'}
                                            </span>
                                        </span>
                                        <span className='truncate text-label text-muted-foreground/70'>
                                            {details?.host || 'No host'}
                                            {details?.port ? `:${details.port}` : ''}
                                        </span>
                                    </span>
                                </Button>
                            );
                        })}
                    </div>
                </PopoverContent>
            )}
        </Popover>
    );
};
