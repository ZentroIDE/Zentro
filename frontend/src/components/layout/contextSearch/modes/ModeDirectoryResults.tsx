// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { CommandEmpty, CommandGroup, CommandItem } from '../../../ui';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';
// Imported for render-time enumeration only; the registry module finishes
// initializing before anything renders, so the import cycle is benign.
import { SEARCH_MODES } from './registry';

interface ModeDirectoryResultsProps extends SearchModeResultsProps {
    heading: string;
    modeFilter: (mode: SearchModeDescriptor) => boolean;
}

/**
 * Directory of registered search modes; selecting a row autocompletes that
 * mode's prefix into the palette input. Backs the '?' cheat-sheet and the
 * bare-'@' scope suggestions.
 */
export const ModeDirectoryResults: React.FC<ModeDirectoryResultsProps> = ({
    query,
    onReplaceQuery,
    heading,
    modeFilter,
}) => {
    const normalizedQuery = query.trim().toLowerCase();
    const listedModes = SEARCH_MODES.filter(
        mode => mode.prefix !== null && modeFilter(mode),
    ).filter(
        mode =>
            !normalizedQuery ||
            `${mode.prefix} ${mode.id} ${mode.description || ''}`
                .toLowerCase()
                .includes(normalizedQuery),
    );

    return (
        <>
            <CommandEmpty>No matching scope.</CommandEmpty>
            {listedModes.length > 0 ? (
                <CommandGroup heading={heading}>
                    {listedModes.map(mode => (
                        <CommandItem
                            key={mode.id}
                            value={`mode:${mode.id}`}
                            onSelect={() => onReplaceQuery?.(`${mode.prefix}`)}
                        >
                            <span className='font-mono text-muted-foreground'>{mode.prefix}</span>
                            <span>{mode.description || mode.dialogTitle}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            ) : null}
        </>
    );
};
