// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import cx from 'classnames';

const Accordion = AccordionPrimitive.Root;
const AccordionItem = AccordionPrimitive.Item;

// ─── Standard trigger (shadcn pattern) ──────────────────────────────────────
const AccordionTrigger = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className='flex'>
        <AccordionPrimitive.Trigger
            ref={ref}
            className={cx(
                'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
                className,
            )}
            {...props}
        >
            {children}
            <ChevronRight className='h-4 w-4 shrink-0 transition-transform duration-200' />
        </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

// ─── Standard content ────────────────────────────────────────────────────────
const AccordionContent = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className={cx('accordion-content-animation text-sm', className)}
        {...props}
    >
        {children}
    </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

// ─── Panel trigger: left-side chevron+title + right-side action slot ─────────
// Used in KeysView where each panel header has both a toggle and action buttons.
interface AccordionPanelTriggerProps extends Omit<
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>,
    'children'
> {
    title: string;
    isOpen: boolean;
    actions?: React.ReactNode;
}

const AccordionPanelTrigger = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Trigger>,
    AccordionPanelTriggerProps
>(({ title, isOpen, actions, className, ...props }, ref) => (
    <AccordionPrimitive.Header
        className={cx(
            'flex h-10 items-center justify-between px-3',
            isOpen && 'border-b border-border/30',
        )}
    >
        <AccordionPrimitive.Trigger
            ref={ref}
            className={cx(
                'flex items-center gap-1.5 min-w-0 cursor-pointer select-none hover:opacity-80 transition-opacity',
                '[&[data-state=open]>svg]:rotate-90',
                className,
            )}
            {...props}
        >
            <ChevronRight
                size={13}
                className='text-muted-foreground shrink-0 transition-transform duration-150'
            />
            <span className='text-small font-medium text-foreground/80 uppercase tracking-wide'>
                {title}
            </span>
        </AccordionPrimitive.Trigger>
        {actions && <div className='flex items-center gap-0.5'>{actions}</div>}
    </AccordionPrimitive.Header>
));
AccordionPanelTrigger.displayName = 'AccordionPanelTrigger';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, AccordionPanelTrigger };
