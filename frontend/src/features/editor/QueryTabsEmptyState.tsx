// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { DOM_EVENT } from '../../lib/constants';
import { emitCommand } from '../../lib/commandBus';
import { useShortcutStore } from '../../stores/shortcutStore';
import type { CommandId } from '../../lib/shortcutRegistry';
import appIcon from '../../assets/images/appicon.png';
import { Button, KeyBinding } from '../../components/ui';

interface EmptyStateHint {
    commandId: CommandId;
    label: string;
    onSelect: () => void;
}

interface QueryTabsEmptyStateProps {
    onNewQuery: () => void;
    isConnected: boolean;
}

/**
 * Editor-canvas empty state shown when no query tabs are open — a faint
 * centered app-mark with a short list of clickable hints (mirrors the
 * default binding unless the user has rebound it), the way VS Code's empty
 * editor group shows "Show All Commands" / "Find in Files" etc.
 */
export const QueryTabsEmptyState: React.FC<QueryTabsEmptyStateProps> = ({
    onNewQuery,
    isConnected,
}) => {
    const getBinding = useShortcutStore(s => s.getBinding);

    const hints: EmptyStateHint[] = [
        { commandId: 'editor.newTab', label: 'New Query Tab', onSelect: onNewQuery },
        {
            commandId: 'view.commandPalette',
            label: 'Show All Commands',
            onSelect: () => emitCommand(DOM_EVENT.OPEN_COMMAND_PALETTE),
        },
        {
            commandId: 'editor.contextSearch',
            label: 'Search',
            onSelect: () => emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH),
        },
    ];

    return (
        <div className='flex h-full w-full flex-col items-center justify-center gap-4'>
            <img
                src={appIcon}
                alt=''
                aria-hidden='true'
                className='pointer-events-none h-80 w-80 object-contain opacity-10 grayscale'
            />
            <div className='flex flex-col gap-1'>
                {hints.map(hint => (
                    <Button
                        key={hint.commandId}
                        type='button'
                        variant='ghost'
                        onClick={hint.onSelect}
                        className='flex h-auto items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left'
                    >
                        <span className='text-small text-muted-foreground'>{hint.label}</span>
                        <KeyBinding binding={getBinding(hint.commandId)} />
                    </Button>
                ))}
                {!isConnected && (
                    <p className='mt-2 px-2.5 text-center text-label text-muted-foreground'>
                        Connect to a database using the sidebar first.
                    </p>
                )}
            </div>
        </div>
    );
};
