// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../../lib/cn';
import { useShortcutStore } from '../../../stores/shortcutStore';
import { usePlatform } from '../../../hooks/usePlatform';
import { formatBindingForDisplay } from '../../../lib/shortcutDisplay';
import { useUpdateCheck } from '../../../hooks/useUpdateCheck';
import { useToast } from '../Toast';
import type { AppMenuItem } from './appMenuSections';
import { buildAppMenuSections } from './appMenuSections';
import type { CommandId } from '../../../lib/shortcutRegistry';
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
    menuItemCompactClass,
} from '../../ui';

interface AppMenuProps {
    /** Logo element placed as the trigger button content */
    trigger: React.ReactNode;
    onOpenAbout: () => void;
    onOpenLicense: () => void;
    onOpenTipOfTheDay: () => void;
    onOpenUpdateModal: (open: boolean) => void;
    hasUpdate: boolean;
    isChecking: boolean;
    check: ReturnType<typeof useUpdateCheck>['check'];
    dismiss: ReturnType<typeof useUpdateCheck>['dismiss'];
}

export const AppMenu: React.FC<AppMenuProps> = ({
    trigger,
    onOpenAbout,
    onOpenLicense,
    onOpenTipOfTheDay,
    onOpenUpdateModal,
    hasUpdate,
    isChecking,
    check,
    dismiss: _dismiss,
}) => {
    const shortcutBindings = useShortcutStore(s => s.bindings);
    const platform = usePlatform();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);

    const getShortcut = useCallback(
        (commandId: CommandId) =>
            formatBindingForDisplay(shortcutBindings[commandId] || '', platform),
        [shortcutBindings, platform],
    );

    const handleManualCheckForUpdates = useCallback(async () => {
        const result = await check(true);
        if (result === undefined) {
            toast.error('Could not check for updates.');
            return;
        }
        if (result?.has_update) {
            // The modal's own CTA (Restart & Install on Windows, Download Now
            // elsewhere) does the actual work - nothing happens silently
            // in the background anymore.
            onOpenUpdateModal(true);
            return;
        }
        toast.success('You are already on the latest version.');
    }, [check, onOpenUpdateModal, toast]);

    const sections = useMemo(
        () =>
            buildAppMenuSections({
                getShortcut,
                isChecking,
                hasUpdate,
                onCheckForUpdates: handleManualCheckForUpdates,
                onOpenAbout,
                onOpenLicense,
                onOpenTipOfTheDay,
            }),
        [
            getShortcut,
            isChecking,
            hasUpdate,
            handleManualCheckForUpdates,
            onOpenAbout,
            onOpenLicense,
            onOpenTipOfTheDay,
        ],
    );

    const selectItem = useCallback(
        (item: AppMenuItem) => {
            if (item.disabled) return;
            Promise.resolve(item.action()).catch(err => toast.error(`Action failed: ${err}`));
        },
        [toast],
    );

    return (
        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={cn(
                        'relative size-6 hover:opacity-80',
                        open && 'bg-muted text-foreground',
                    )}
                    title='Open app menu'
                    aria-label='Open app menu'
                >
                    {trigger}
                    {hasUpdate && (
                        <span className='absolute -top-0.5 -right-0.5 size-2 rounded-full border border-background bg-success animate-pulse glow-success' />
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align='start' sideOffset={6} className='z-toolbar w-[168px] p-1'>
                <DropdownMenuGroup className='flex flex-col gap-0.5'>
                    {sections.map(section => (
                        <DropdownMenuSub key={section.id}>
                            <DropdownMenuSubTrigger
                                className={cn(
                                    menuItemCompactClass,
                                    // Explicit and !important: this must render at the
                                    // exact same size as the leaf DropdownMenuItem rows
                                    // below it, regardless of any inherited font-size
                                    // from context this trigger happens to render in.
                                    'text-small! font-normal text-popover-foreground data-[state=open]:text-popover-foreground',
                                )}
                            >
                                {section.title}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent
                                    sideOffset={4}
                                    className='z-[calc(var(--layer-toolbar)+1)] w-[280px] p-1'
                                >
                                    <DropdownMenuGroup className='flex flex-col gap-0.5'>
                                        {section.items.map(item => (
                                            <DropdownMenuItem
                                                key={item.id}
                                                disabled={item.disabled}
                                                {...(item.danger ? { danger: true } : {})}
                                                onSelect={() => selectItem(item)}
                                                className={cn(
                                                    menuItemCompactClass,
                                                    'text-small! gap-2',
                                                )}
                                            >
                                                <span className='inline-flex items-center gap-1.5'>
                                                    <span>{item.label}</span>
                                                    {item.hasBadge && (
                                                        <span className='size-1.5 rounded-full bg-success animate-pulse' />
                                                    )}
                                                </span>
                                                {item.shortcut && (
                                                    <DropdownMenuShortcut className='text-label'>
                                                        {item.shortcut}
                                                    </DropdownMenuShortcut>
                                                )}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
