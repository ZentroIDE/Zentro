// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { Command, CommandInput, CommandList, SpotlightDialog, SpotlightPanel } from '../ui';
import { SchemaDiffSourceDialog } from './contextSearch/SchemaDiffSourceDialog';
import { resolveSearchMode } from './contextSearch/modes/registry';

interface Props {
    onClose: () => void;
    initialQuery?: string;
    mode?: 'default' | 'schema-diff-source';
    targetSide?: 'left' | 'right';
    nextPickerSide?: 'left' | 'right';
    compareTabId?: string;
    initialEnvironmentKey?: string;
    initialSchemaName?: string;
}

/**
 * Unified Spotlight palette. The leading prefix of the query picks the search
 * mode via the search-mode registry ('#' scripts, '>' commands, '@git'
 * branches, ...); the fallback mode is schema-object search. Mode content and
 * behavior live in `contextSearch/modes/` — this shell only resolves and
 * renders the active mode.
 */
export const ContextSearchDialog: React.FC<Props> = ({
    onClose,
    initialQuery,
    mode = 'default',
    targetSide,
    nextPickerSide,
    compareTabId,
    initialEnvironmentKey,
    initialSchemaName,
}) => {
    const [query, setQuery] = React.useState(initialQuery || '');
    const [selectedValue, setSelectedValue] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);

    // Resolved up here (not just before render) so the reset effect below can
    // depend on it while staying above the early return.
    const { mode: searchMode, effectiveQuery } = resolveSearchMode(query);

    React.useEffect(() => {
        setQuery(initialQuery || '');
    }, [initialQuery]);

    // `<Command shouldFilter={false}>` plus a controlled `value` means cmdk
    // never re-selects the first row or scrolls on a search change — the
    // highlight and scroll position just stay put. Drive both ourselves
    // whenever the query (or mode) changes: modes filter synchronously so the
    // new rows are already in the DOM here. Reset the scroll twice — now, and
    // again after cmdk's own post-render scheduling has flushed — so a
    // stale scrollTop can't survive.
    React.useLayoutEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const firstItem = list.querySelector<HTMLElement>(
            '[cmdk-item=""]:not([aria-disabled="true"])',
        );
        setSelectedValue(firstItem?.getAttribute('data-value') ?? '');
        const toTop = () => {
            if (listRef.current) listRef.current.scrollTop = 0;
        };
        toTop();
        const raf = requestAnimationFrame(toTop);
        return () => cancelAnimationFrame(raf);
    }, [effectiveQuery, searchMode.id]);

    // Radix's dialog focus scope autofocuses the input with select-all, which
    // would make the first keystroke wipe a prefilled prefix ('>', '@git ').
    // Collapse the selection to the end of the input instead.
    React.useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const input = inputRef.current;
            if (!input) return;
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
        return () => cancelAnimationFrame(frame);
    }, [initialQuery]);

    if (mode === 'schema-diff-source') {
        return (
            <SchemaDiffSourceDialog
                onClose={onClose}
                targetSide={targetSide}
                nextPickerSide={nextPickerSide}
                compareTabId={compareTabId}
                initialEnvironmentKey={initialEnvironmentKey}
                initialSchemaName={initialSchemaName}
            />
        );
    }

    return (
        <SpotlightDialog
            open
            onOpenChange={open => !open && onClose()}
            title={searchMode.dialogTitle}
        >
            <SpotlightPanel>
                <Command
                    shouldFilter={false}
                    loop
                    value={selectedValue}
                    onValueChange={setSelectedValue}
                    className='h-full bg-card text-foreground'
                >
                    <div className='relative'>
                        <CommandInput
                            ref={inputRef}
                            value={query}
                            onValueChange={setQuery}
                            placeholder={searchMode.placeholder}
                            hideIcon
                            className='h-8 mt-1 px-2 w-full border border-(--border-panel)'
                        />
                        {searchMode.InputAccessory ? (
                            <searchMode.InputAccessory onReplaceQuery={setQuery} />
                        ) : null}
                    </div>

                    <CommandList ref={listRef} className='max-h-107.5 py-1 [overflow-anchor:none]'>
                        <searchMode.Results
                            query={effectiveQuery}
                            onClose={onClose}
                            onReplaceQuery={setQuery}
                        />
                    </CommandList>
                </Command>
            </SpotlightPanel>
        </SpotlightDialog>
    );
};
