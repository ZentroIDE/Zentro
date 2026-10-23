// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
    CONTROL_SIZE_CLASS,
    DENSITY_CLASS,
    STATE_CLASS,
    TONE_CLASS,
    TEXT_ENTRY_FOCUS_CLASS,
    interactiveMenuItem,
    normalizeControlSize,
    controlGhost,
    controlSurface,
    controlOutline,
    type ControlSizeInput,
    type DesignSystemControlProps,
} from './contract';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> &
        DesignSystemControlProps & {
            size?: ControlSizeInput;
            variant?: 'ghost' | 'surface' | 'outline';
            /** Render the caller's single child as the trigger — no default
             * chrome, no chevron. The child owns its styling. */
            asChild?: boolean;
        }
>(
    (
        {
            className,
            children,
            tone = 'default',
            state = 'default',
            density = 'compact',
            size = 'default',
            variant = 'ghost',
            asChild = false,
            ...props
        },
        ref,
    ) => {
        if (asChild) {
            return (
                <SelectPrimitive.Trigger
                    ref={ref}
                    asChild
                    data-tone={tone}
                    data-ui-state={state}
                    className={className}
                    {...props}
                >
                    {children}
                </SelectPrimitive.Trigger>
            );
        }
        const normalizedSize = normalizeControlSize(size);
        return (
            <SelectPrimitive.Trigger
                ref={ref}
                data-tone={tone}
                data-ui-state={state}
                aria-busy={state === 'loading' ? true : undefined}
                className={cn(
                    'flex w-full items-center justify-between rounded-md border font-sans',
                    'outline-none transition-colors duration-fast',
                    TEXT_ENTRY_FOCUS_CLASS,
                    'disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground',
                    variant === 'ghost'
                        ? cn(
                              controlGhost,
                              'border-transparent bg-transparent text-(--content-secondary) hover:bg-(--state-hover-bg) hover:text-(--content-primary)',
                          )
                        : variant === 'surface'
                          ? cn(
                                controlSurface,
                                'border-(--border-default) bg-(--surface-elevated) text-(--content-primary) hover:bg-(--state-hover-bg)',
                            )
                          : cn(
                                controlOutline,
                                'border-(--border-default) bg-transparent text-(--content-primary) hover:bg-(--state-hover-bg)',
                            ),
                    CONTROL_SIZE_CLASS[normalizedSize],
                    DENSITY_CLASS[density],
                    TONE_CLASS[tone],
                    STATE_CLASS[state],
                    className,
                )}
                {...props}
            >
                {children}
                <SelectPrimitive.Icon asChild>
                    <ChevronDown size={12} className='text-muted-foreground ml-1 shrink-0' />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
        );
    },
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollUpButton
        ref={ref}
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...props}
    >
        <ChevronUp size={12} />
    </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollDownButton
        ref={ref}
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...props}
    >
        <ChevronDown size={12} />
    </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            className={cn(
                // Above modal-confirm: a Select opened inside a Dialog (z-modal) must not render behind it.
                'relative z-[calc(var(--layer-modal-confirm)+1)] max-h-96 min-w-32 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-elevation-md',
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                position === 'popper' &&
                    'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                className,
            )}
            position={position}
            {...props}
        >
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
                className={cn(
                    'p-1',
                    position === 'popper' &&
                        'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)',
                )}
            >
                {children}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Label
        ref={ref}
        className={cn('px-2 py-1 text-small font-semibold text-muted-foreground', className)}
        {...props}
    />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cn(
            'relative flex h-(--control-height-default) w-full cursor-pointer select-none items-center rounded-md pr-7 pl-2 text-small font-normal leading-none outline-none',
            interactiveMenuItem,
            'data-disabled:pointer-events-none data-disabled:opacity-50',
            className,
        )}
        {...props}
    >
        <span className='absolute right-2 flex h-3.5 w-3.5 items-center justify-center'>
            <SelectPrimitive.ItemIndicator>
                <Check size={12} />
            </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 my-1 h-px bg-border', className)}
        {...props}
    />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
};
