// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { cn } from '../../lib/cn';
import { usePlatform } from '../../hooks/usePlatform';
import { formatShortcutToken, toShortcutDisplayPlatform } from '../../lib/shortcutDisplay';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

/** A single key badge, e.g. the "Ctrl" in "Ctrl+K" — the shared visual for
 *  every individual-key rendering in the app (empty-state hints, the
 *  shortcuts table, ...). Keep key styling here, not re-declared per feature. */
export const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => (
    <kbd
        ref={ref}
        className={cn(
            'rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-label font-mono text-muted-foreground',
            className,
        )}
        {...props}
    />
));
Kbd.displayName = 'Kbd';

interface KeyBindingProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** A single stroke ("Ctrl+Shift+P") or a chord of strokes separated by
     *  spaces ("Ctrl+K Ctrl+B"), the shape `normalizeRuleBinding` produces.
     *  The stored binding is always platform-neutral ("ctrl" matches both
     *  physical Ctrl and Cmd, see eventToKeyToken) — this component is what
     *  translates it into the platform's own symbols at render time. */
    binding: string;
}

/** A full keybinding (e.g. "Ctrl+K Ctrl+B") as a row of `Kbd` chips — each
 *  stroke split into individual key chips, strokes themselves separated by
 *  a gap (sequential presses, not simultaneous). Renders mac symbols
 *  (⌘⇧P, no "+") on macOS and Ctrl+Shift+P text on Windows/Linux. */
export const KeyBinding = React.forwardRef<HTMLSpanElement, KeyBindingProps>(
    ({ binding, className, ...props }, ref) => {
        const platform = toShortcutDisplayPlatform(usePlatform());
        const isMac = platform === 'mac';
        const strokes = binding.split(' ').filter(Boolean);
        if (strokes.length === 0) return null;
        return (
            <span
                ref={ref}
                className={cn('flex shrink-0 items-center gap-2', className)}
                {...props}
            >
                {strokes.map((stroke, strokeIndex) => (
                    <span key={strokeIndex} className='flex items-center gap-1'>
                        {stroke
                            .split('+')
                            .filter(Boolean)
                            .map((token, index) => (
                                <React.Fragment key={index}>
                                    {index > 0 && !isMac && (
                                        <span className='text-label text-muted-foreground/50'>
                                            +
                                        </span>
                                    )}
                                    <Kbd>{formatShortcutToken(token, platform)}</Kbd>
                                </React.Fragment>
                            ))}
                    </span>
                ))}
            </span>
        );
    },
);
KeyBinding.displayName = 'KeyBinding';
