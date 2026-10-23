// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, Switch } from '../../components/ui';
import { AssistantConfig } from './AssistantConfig';

interface AssistantSetupProps {
    includeBodies: boolean;
    busy: boolean;
    onIncludeBodiesChange: (value: boolean) => void;
    granted: boolean;
    onRevoke: () => void;
    autoApprove: boolean;
    onAutoApproveChange: (value: boolean) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// AssistantSetup holds provider, key, and the chat's switches in a popover so
// the chat itself stays quiet.
export function AssistantSetup({
    includeBodies,
    busy,
    onIncludeBodiesChange,
    granted,
    onRevoke,
    autoApprove,
    onAutoApproveChange,
    open,
    onOpenChange,
}: AssistantSetupProps) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label='Chat setup'
                    title='Chat setup'
                >
                    <SlidersHorizontal className='size-3.5' aria-hidden />
                </Button>
            </PopoverTrigger>
            <PopoverContent align='start' side='top' className='flex w-80 flex-col p-0'>
                <AssistantConfig />
                <div className='flex items-center justify-between gap-3 border-t border-border px-3 py-2.5'>
                    <p className='text-small'>Include view, routine and script text</p>
                    <Switch
                        checked={includeBodies}
                        disabled={busy}
                        aria-label='Include object text in this send'
                        onCheckedChange={checked => onIncludeBodiesChange(Boolean(checked))}
                    />
                </div>
                <div className='flex items-center justify-between gap-3 border-t border-border px-3 py-2.5'>
                    <div className='flex min-w-0 flex-col gap-0.5'>
                        <p className='text-small'>Send without review in this project</p>
                        <p className='text-label text-muted-foreground'>
                            Every request still shows in Sent to, and text that looks like personal
                            data is still held.
                        </p>
                    </div>
                    <Switch
                        checked={autoApprove}
                        disabled={busy}
                        aria-label='Send without review in this project'
                        onCheckedChange={checked => onAutoApproveChange(Boolean(checked))}
                    />
                </div>
                {granted && !autoApprove && (
                    <div className='flex items-center justify-between gap-3 border-t border-border px-3 py-2'>
                        <p className='text-label text-muted-foreground'>
                            Schema data is allowed for this chat
                        </p>
                        <Button
                            type='button'
                            size='micro'
                            variant='ghost'
                            disabled={busy}
                            onClick={onRevoke}
                        >
                            Ask again
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
