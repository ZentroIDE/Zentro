// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { buildCommands, type CommandCategory, type CommandItem } from '../../../../lib/commands';
import { useEditorStore } from '../../../../stores/editorStore';
import {
    CommandEmpty,
    CommandGroup,
    CommandItem as CommandItemRow,
    CommandShortcut,
} from '../../../ui';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const CATEGORY_ORDER: CommandCategory[] = ['Editor', 'View', 'Layout', 'Connection', 'App'];

const CommandResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const commandGroups = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const available = buildCommands().filter(
            command => command.id !== 'view.commandPalette' && Boolean(command.action),
        );

        // Every query token must appear as a substring (labels are short prose,
        // so subsequence fuzzy matching produces nonsense hits like
        // "reload" → "Switch Envi-r-onm-e-nt ..."). Rank label hits first.
        const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
        const matched =
            tokens.length > 0
                ? available
                      .map(command => {
                          const label = command.label.toLowerCase();
                          const haystack =
                              `${label} ${command.category} ${command.keybinding || ''}`.toLowerCase();
                          if (!tokens.every(token => haystack.includes(token))) return null;
                          const labelIndex = label.indexOf(tokens[0]);
                          return {
                              command,
                              rank: labelIndex === -1 ? Number.MAX_SAFE_INTEGER : labelIndex,
                          };
                      })
                      .filter(
                          (entry): entry is { command: CommandItem; rank: number } =>
                              entry !== null,
                      )
                      .sort((left, right) => left.rank - right.rank)
                      .map(entry => entry.command)
                : available;

        const grouped = new Map<CommandCategory, CommandItem[]>();
        matched.forEach(command => {
            const bucket = grouped.get(command.category) || [];
            bucket.push(command);
            grouped.set(command.category, bucket);
        });

        return CATEGORY_ORDER.map(category => ({
            category,
            commands: grouped.get(category) || [],
        })).filter(group => group.commands.length > 0);
    }, [query]);

    const handleSelect = React.useCallback(
        (action: () => void | Promise<void>) => {
            onClose();
            void Promise.resolve(action());
        },
        [onClose],
    );

    // Lets the command palette jump straight to an already-open tab, same
    // as the command-id matches above, but synthesized from live editor
    // state instead of the static command registry (same pattern scriptMode
    // uses to open a saved script into a tab).
    const openTabMatches = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
        const { groups } = useEditorStore.getState();
        const allTabs = groups.flatMap(group => group.tabs.map(tab => ({ group, tab })));
        if (tokens.length === 0) return [];
        return allTabs.filter(({ tab }) => {
            const haystack = tab.name.toLowerCase();
            return tokens.every(token => haystack.includes(token));
        });
    }, [query]);

    const handleOpenTab = React.useCallback(
        (groupId: string, tabId: string) => {
            const { setActiveGroupId, setActiveTabId } = useEditorStore.getState();
            setActiveGroupId(groupId);
            setActiveTabId(tabId, groupId);
            onClose();
        },
        [onClose],
    );

    return (
        <>
            <CommandEmpty>No commands found.</CommandEmpty>
            {openTabMatches.length > 0 && (
                <CommandGroup heading='Open Tabs'>
                    {openTabMatches.map(({ group, tab }) => (
                        <CommandItemRow
                            key={`tab:${tab.id}`}
                            value={`open tab ${tab.name}`}
                            onSelect={() => handleOpenTab(group.id, tab.id)}
                        >
                            <span>{tab.name}</span>
                        </CommandItemRow>
                    ))}
                </CommandGroup>
            )}
            {commandGroups.map(group => (
                <CommandGroup key={group.category} heading={group.category}>
                    {group.commands.map(command => (
                        <CommandItemRow
                            key={command.id}
                            value={`${command.label} ${command.category} ${command.keybinding || ''}`}
                            onSelect={() => handleSelect(command.action)}
                        >
                            <span>{command.label}</span>
                            {command.keybinding ? (
                                <CommandShortcut>{command.keybinding}</CommandShortcut>
                            ) : null}
                        </CommandItemRow>
                    ))}
                </CommandGroup>
            ))}
        </>
    );
};

export const commandMode: SearchModeDescriptor = {
    id: 'command',
    prefix: '>',
    description: 'Run application commands and actions',
    placeholder: 'Type a command or search actions...',
    dialogTitle: 'Command Palette',
    Results: CommandResults,
};
