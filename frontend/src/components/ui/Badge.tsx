// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { cn } from '../../lib/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'muted' | 'success' | 'destructive' | 'warning' | 'info';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', children, ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={cn(
                    'inline-flex items-center rounded-md px-1.5 py-0.5 text-label font-medium leading-none tracking-wide uppercase',
                    {
                        'bg-[var(--state-selected-bg)] text-[var(--state-selected-text)]':
                            variant === 'default',
                        'bg-[var(--state-info-bg)] text-info': variant === 'info',
                        'bg-muted/70 text-muted-foreground': variant === 'muted',
                        'bg-[var(--state-success-bg)] text-success': variant === 'success',
                        'bg-[var(--state-destructive-bg)] text-destructive':
                            variant === 'destructive',
                        'bg-[var(--state-warning-bg)] text-warning': variant === 'warning',
                    },
                    className,
                )}
                {...props}
            >
                {children}
            </span>
        );
    },
);

Badge.displayName = 'Badge';
