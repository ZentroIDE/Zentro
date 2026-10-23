// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import { type DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { interactiveCommandItem } from './contract';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

const Command = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
    <CommandPrimitive
        ref={ref}
        className={cn(
            'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
            className,
        )}
        {...props}
    />
));
Command.displayName = CommandPrimitive.displayName;

interface SpotlightDialogProps extends DialogProps {
    children: React.ReactNode;
    title: string;
    description?: string;
}

/**
 * Shared shell for top-anchored "spotlight" style dialogs (context search, command
 * palette, ...): full-screen transparent overlay, panel slides in from the top.
 */
const SpotlightDialog = ({
    children,
    title,
    description,
    onOpenChange,
    ...props
}: SpotlightDialogProps) => (
    <Dialog onOpenChange={onOpenChange} {...props}>
        <DialogContent
            size='full'
            showCloseButton={false}
            className='flex items-start justify-center bg-transparent border-none shadow-none pt-[15vh]'
            // The content fills the whole screen, so a click beside the panel
            // lands on the content itself and Radix never treats it as
            // "outside" - close on a press on the bare backdrop ourselves.
            onPointerDown={event => {
                if (event.target === event.currentTarget) onOpenChange?.(false);
            }}
        >
            <DialogTitle className='sr-only'>{title}</DialogTitle>
            {description ? (
                <DialogDescription className='sr-only'>{description}</DialogDescription>
            ) : null}
            {children}
        </DialogContent>
    </Dialog>
);

const SpotlightPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'w-180 max-h-140 flex flex-col bg-card border border-border rounded-md shadow-elevation-lg overflow-hidden animate-in slide-in-from-top-3 duration-150',
                className,
            )}
            {...props}
        />
    ),
);
SpotlightPanel.displayName = 'SpotlightPanel';

interface CommandInputProps extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> {
    hideIcon?: boolean;
}

const CommandInput = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Input>,
    CommandInputProps
>(({ className, hideIcon = false, ...props }, ref) => (
    <div className='flex items-center px-3' cmdk-input-wrapper=''>
        {!hideIcon && <Search className='mr-2 h-4 w-4 shrink-0 opacity-50' />}
        <CommandPrimitive.Input
            ref={ref}
            className={cn(
                'flex h-10 w-full rounded-md bg-transparent py-3 text-small outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.List
        ref={ref}
        className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
        {...props}
    />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Empty>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
    <CommandPrimitive.Empty
        ref={ref}
        className='py-6 text-center text-body text-muted-foreground'
        {...props}
    />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Group>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Group
        ref={ref}
        className={cn(
            'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground',
            className,
        )}
        {...props}
    />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 h-px bg-border', className)}
        {...props}
    />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Item
        ref={ref}
        className={cn(
            'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-small outline-none',
            interactiveCommandItem,
            'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
            className,
        )}
        {...props}
    />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span
        className={cn('ml-auto text-label tracking-wide text-muted-foreground', className)}
        {...props}
    />
);
CommandShortcut.displayName = 'CommandShortcut';

export {
    Command,
    SpotlightDialog,
    SpotlightPanel,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
    CommandSeparator,
};
