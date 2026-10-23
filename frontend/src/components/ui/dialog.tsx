// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CLICKABLE_FOCUS_CLASS, interactiveIconAction } from './contract';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

// Wails frameless window drag opt-in/out (same mechanism the Toolbar uses).
const WINDOW_DRAG_STYLE = { '--wails-draggable': 'drag' } as React.CSSProperties &
    Record<'--wails-draggable', string>;
const WINDOW_NO_DRAG_STYLE = { '--wails-draggable': 'no-drag' } as React.CSSProperties &
    Record<'--wails-draggable', string>;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & { windowDrag?: boolean }
>(({ className, windowDrag, style, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'fixed inset-0 z-modal bg-overlay',
            'data-[state=open]:animate-[dialog-backdrop-step-in_420ms_ease-out_forwards]',
            'data-[state=closed]:animate-[dialog-backdrop-step-out_300ms_ease-in_forwards]',
            className,
        )}
        // The dimmed backdrop doubles as a window-drag handle when asked — for
        // dialogs shown without the Toolbar, so the frameless window can still
        // be moved by grabbing the area around the dialog.
        style={windowDrag ? { ...style, ...WINDOW_DRAG_STYLE } : style}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogSize = 'sm' | 'md' | 'lg' | 'full';

const sizeClasses: Record<DialogSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    full: 'inset-0 w-screen h-screen max-w-none rounded-none',
};

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
        overlayClassName?: string;
        showCloseButton?: boolean;
        closeClassName?: string;
        size?: DialogSize;
        /**
         * Make the dimmed backdrop a window-drag handle (Wails frameless).
         * For dialogs shown without the Toolbar — e.g. the first-run project
         * wizard — so the window can still be moved. The dialog surface itself
         * stays non-draggable.
         */
        draggableBackdrop?: boolean;
    }
>(
    (
        {
            className,
            children,
            overlayClassName,
            showCloseButton = true,
            closeClassName,
            size = 'md',
            draggableBackdrop = false,
            style,
            ...props
        },
        ref,
    ) => {
        const isFullScreen = size === 'full';
        return (
            <DialogPortal>
                <DialogOverlay className={overlayClassName} windowDrag={draggableBackdrop} />
                <DialogPrimitive.Content
                    ref={ref}
                    style={draggableBackdrop ? { ...style, ...WINDOW_NO_DRAG_STYLE } : style}
                    className={cn(
                        'fixed z-modal w-full bg-background rounded-md text-card-foreground shadow-[--elevation-md]',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                        'data-[state=open]:zoom-in-[0.985] data-[state=closed]:zoom-out-[0.985]',
                        'data-[state=open]:duration-320 data-[state=closed]:duration-220',
                        'data-[state=open]:ease-out data-[state=closed]:ease-in',
                        isFullScreen
                            ? sizeClasses.full
                            : cn(
                                  'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md',
                                  sizeClasses[size],
                              ),
                        className,
                    )}
                    {...props}
                >
                    {children}
                    {showCloseButton ? (
                        <DialogPrimitive.Close
                            className={cn(
                                'absolute top-2.5 right-3 flex items-center justify-center h-(--control-height-default) w-(--control-height-default) rounded-md transition-colors',
                                CLICKABLE_FOCUS_CLASS,
                                interactiveIconAction,
                                closeClassName,
                            )}
                        >
                            <X className='h-3 w-3' />
                            <span className='sr-only'>Close</span>
                        </DialogPrimitive.Close>
                    ) : null}
                </DialogPrimitive.Content>
            </DialogPortal>
        );
    },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('px-4 py-3', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('px-4 py-3 flex items-center justify-end gap-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-small font-semibold leading-none pr-6', className)}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn('text-label text-muted-foreground', className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
