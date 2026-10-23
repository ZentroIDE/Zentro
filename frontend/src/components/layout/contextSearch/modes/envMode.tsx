// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Server } from 'lucide-react';

import { useEnvironmentSwitch } from '../../../../hooks/useEnvironmentSwitch';
import { useConnectionStore } from '../../../../stores/connectionStore';
import { buildSchemaDiffEnvironmentChoices } from '../../../../lib/schemaDiffSourceOptions';
import { CommandEmpty, CommandGroup, CommandItem } from '../../../ui';
import type { EnvironmentKey } from '../../../../types/project';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const EnvironmentResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const { switchEnvironment, activeEnvironmentKey, activeProject } = useEnvironmentSwitch();
    const loadedConnections = useConnectionStore(state => state.connections);

    const choices = React.useMemo(
        () => buildSchemaDiffEnvironmentChoices(activeProject, loadedConnections),
        [activeProject, loadedConnections],
    );

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = React.useMemo(
        () =>
            normalizedQuery
                ? choices.filter(option =>
                      `${option.environmentLabel} ${option.profileName} ${option.databaseName}`
                          .toLowerCase()
                          .includes(normalizedQuery),
                  )
                : choices,
        [choices, normalizedQuery],
    );

    const activeKey = activeEnvironmentKey || activeProject?.default_environment_key;

    if (!activeProject) {
        return <CommandEmpty>No active project.</CommandEmpty>;
    }

    return (
        <>
            <CommandEmpty>No environment matches your search.</CommandEmpty>
            {filtered.length > 0 ? (
                <CommandGroup heading='Environments'>
                    {filtered.map(option => (
                        <CommandItem
                            key={option.environmentKey}
                            value={`env:${option.environmentKey}`}
                            onSelect={() => {
                                void switchEnvironment(
                                    option.environmentKey as EnvironmentKey,
                                ).then(() => onClose());
                            }}
                        >
                            <Server size={12} className='shrink-0 text-muted-foreground' />
                            <span className='truncate'>{option.environmentLabel}</span>
                            <span className='truncate text-label text-muted-foreground'>
                                {option.profileName || 'No connection'} ·{' '}
                                {option.databaseName || 'No DB'}
                            </span>
                            {option.environmentKey === activeKey ? (
                                <span className='ml-auto text-label font-semibold text-[--interactive-primary]'>
                                    active
                                </span>
                            ) : null}
                        </CommandItem>
                    ))}
                </CommandGroup>
            ) : null}
        </>
    );
};

export const envMode: SearchModeDescriptor = {
    id: 'env',
    prefix: '@env',
    description: 'Switch the active project environment',
    placeholder: 'Switch environment...',
    dialogTitle: 'Environments',
    Results: EnvironmentResults,
};
