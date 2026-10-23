// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { cn } from '../../lib/cn';
import { cva, type VariantProps } from 'class-variance-authority';

const progressTrackVariants = cva('relative w-full overflow-hidden rounded-full bg-muted', {
    variants: {
        size: {
            default: 'h-1.5',
            sm: 'h-1',
        },
    },
    defaultVariants: {
        size: 'default',
    },
});

const progressFillVariants = cva('h-full rounded-full transition-[width] duration-300 ease-out', {
    variants: {
        tone: {
            default: 'bg-primary',
            success: 'bg-success',
            warning: 'bg-warning',
            destructive: 'bg-destructive',
        },
    },
    defaultVariants: {
        tone: 'default',
    },
});

export interface ProgressProps
    extends
        Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
        VariantProps<typeof progressTrackVariants>,
        VariantProps<typeof progressFillVariants> {
    /** 0–100. Omit (or pass `undefined`) for an indeterminate bar — used when
     *  a job's total is unknown (see JobProgress.total in job_service.go). */
    value?: number;
    /** Accessible label read by screen readers; falls back to a generic one. */
    label?: string;
    /** Appended after the tone-derived fill color — use Tailwind's `!`
     *  important suffix (e.g. `bg-background/90!`) to actually win over it.
     *  For embedding the bar on a non-default background (the colored
     *  status bar) where the themed tones and the `bg-muted` track would
     *  otherwise blend in. */
    fillClassName?: string;
}

/** A determinate or indeterminate progress bar. Plain CSS/divs rather than
 *  Radix (no @radix-ui/react-progress dependency in this repo) — see
 *  components/ui/Spinner.tsx for the same non-Radix pattern used for a
 *  simpler primitive. Determinate progress renders `role="progressbar"`
 *  with `aria-valuenow`; indeterminate omits `aria-valuenow` per the
 *  ARIA authoring practices for an indeterminate progress indicator. */
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, size, tone, value, label = 'Progress', fillClassName, ...props }, ref) => {
        const clamped = value === undefined ? undefined : Math.min(100, Math.max(0, value));
        const fillClass = cn(progressFillVariants({ tone }), fillClassName);

        return (
            <div
                ref={ref}
                role='progressbar'
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={clamped}
                className={cn(progressTrackVariants({ size }), className)}
                {...props}
            >
                {clamped === undefined ? (
                    <div
                        aria-hidden
                        className={cn(
                            fillClass,
                            'progress-bar-indeterminate absolute inset-y-0 left-0 w-2/5',
                        )}
                    />
                ) : (
                    <div className={fillClass} style={{ width: `${clamped}%` }} />
                )}
            </div>
        );
    },
);

Progress.displayName = 'Progress';
