// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ChevronDown, SpellCheck2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui';
import { interactiveActive, interactiveSelectable } from '../../../components/ui/contract';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useFocusZone } from '../../../lib/focusZoneRegistry';
import { ALL_SCHEMAS_VALUE } from './useExplorerDerivations';
import type { ExplorerUiStateUpdater } from './explorerUiState';

/**
 * How long the filter box stays "open" for more typing before the tree is
 * rebuilt. Filtering force-expands every schema
 * (useDatabaseExplorerModel.isSchemaExpanded), so each committed filter change
 * can mount thousands of rows at ~0.8ms each; committing per keystroke blocked
 * the main thread long enough to feel like the input itself was lagging.
 */
export const EXPLORER_FILTER_DEBOUNCE_MS = 500;

interface ExplorerToolbarProps {
    filter: string;
    fuzzyMatch: boolean;
    selectedSchema: string;
    showMoreCategories: boolean;
    hasSecondaryCategories: boolean;
    availableSchemas: string[];
    filterInputRef: React.RefObject<HTMLInputElement>;
    updateExplorerUiState: ExplorerUiStateUpdater;
}

// Filter input, schema scope select, and the more-categories toggle.
export const ExplorerToolbar: React.FC<ExplorerToolbarProps> = ({
    filter,
    fuzzyMatch,
    selectedSchema,
    showMoreCategories,
    hasSecondaryCategories,
    availableSchemas,
    filterInputRef,
    updateExplorerUiState,
}) => {
    // The typed text is owned locally so every keystroke paints immediately;
    // only `debouncedFilter` reaches explorerUiState, so the expensive tree
    // rebuild runs once the user pauses.
    const {
        value: filterInput,
        debouncedValue: debouncedFilter,
        setValue,
        flush,
    } = useDebouncedValue(filter, EXPLORER_FILTER_DEBOUNCE_MS);

    React.useEffect(() => {
        if (debouncedFilter === filter) return;
        updateExplorerUiState({ filter: debouncedFilter });
    }, [debouncedFilter, filter, updateExplorerUiState]);

    useFocusZone('explorer', filterInputRef);

    return (
        <div data-zone='explorer'>
            <div
                className='relative flex-1 min-w-0 rounded-md border border-border/80'
                // Commit the moment the field loses focus: results should never
                // visibly disagree with what is in the box.
                onBlur={flush}
            >
                <Input
                    ref={filterInputRef}
                    type='text'
                    size='sm'
                    variant='ghost'
                    className='w-full border-none! rounded-md bg-background'
                    placeholder='Filter objects...'
                    value={filterInput}
                    onChange={event => setValue(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            setValue('');
                            flush();
                            return;
                        }
                        // Tab moves into the result list when one is showing.
                        // The fuzzy toggle and schema select stay in the tab
                        // order for Shift+Tab from the row.
                        if (event.key !== 'Tab' || event.shiftKey) return;
                        const explorer = event.currentTarget.closest(
                            '[data-tour="database-explorer"]',
                        );
                        const firstResult = explorer?.querySelector<HTMLElement>(
                            '[data-explorer-focusable][tabindex="0"]',
                        );
                        if (!firstResult) return;
                        event.preventDefault();
                        firstResult.focus();
                    }}
                />
                <Button
                    variant='ghost'
                    size='icon'
                    className={cn(
                        'absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 p-0 text-muted-foreground transition-colors duration-fast',
                        fuzzyMatch ? interactiveActive : 'ui-interactive-surface',
                    )}
                    title={fuzzyMatch ? 'Fuzzy match: On' : 'Fuzzy match: Off'}
                    aria-label='Toggle fuzzy match'
                    aria-pressed={fuzzyMatch}
                    onClick={() => updateExplorerUiState({ fuzzyMatch: !fuzzyMatch })}
                >
                    <SpellCheck2 size={12} className='opacity-90' />
                </Button>
            </div>
            <div className='shrink-0 flex items-center gap-1.5 justify-between mt-1'>
                <span className='text-body text-muted-foreground'>Schema</span>
                <div className='min-w-0'>
                    <Select
                        value={selectedSchema}
                        onValueChange={value => updateExplorerUiState({ selectedSchema: value })}
                    >
                        <SelectTrigger
                            aria-label='Select schema'
                            title={
                                selectedSchema === ALL_SCHEMAS_VALUE
                                    ? 'All schemas'
                                    : selectedSchema
                            }
                            className={cn(
                                'outline-none flex h-6 w-full min-w-0 rounded-md border-transparent! bg-transparent! hover:bg-(--state-hover-bg)! px-2 text-center text-body! text-foreground shadow-none focus:ring-0',
                                interactiveSelectable,
                            )}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_SCHEMAS_VALUE}>All schemas</SelectItem>
                            {availableSchemas.map(schemaName => (
                                <SelectItem key={schemaName} value={schemaName}>
                                    {schemaName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {hasSecondaryCategories && (
                    <Button
                        variant='ghost'
                        size='icon'
                        className={cn(
                            'p-0 text-muted-foreground transition-colors duration-fast',
                            showMoreCategories ? interactiveActive : 'ui-interactive-surface',
                        )}
                        onClick={() =>
                            updateExplorerUiState({
                                showMoreCategories: !showMoreCategories,
                            })
                        }
                        aria-expanded={showMoreCategories}
                        title={showMoreCategories ? 'Show fewer actions' : 'Show more actions'}
                    >
                        <ChevronDown
                            size={12}
                            className={cn(
                                'transition-transform',
                                showMoreCategories && 'rotate-180',
                            )}
                        />
                    </Button>
                )}
            </div>
        </div>
    );
};
