// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { cn } from '@/lib/cn';
import type { ComponentTone } from './contract';

type IndicatorMode = 'dot' | 'count';

const STATUS_TONE_BACKGROUND: Partial<Record<ComponentTone, string>> = {
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    destructive: 'var(--status-destructive)',
    info: 'var(--status-info)',
};

interface IndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
    mode?: IndicatorMode;
    value?: number;
    showZero?: boolean;
    max?: number;
    color?: string;
    tone?: ComponentTone;
}

export const Indicator: React.FC<IndicatorProps> = ({
    mode = 'dot',
    value,
    showZero = false,
    max = 99,
    color,
    tone,
    className,
    style,
    ...props
}) => {
    const backgroundColor = (tone && STATUS_TONE_BACKGROUND[tone]) || color;

    if (mode === 'count') {
        const nextValue = typeof value === 'number' ? value : 0;
        if (!showZero && nextValue <= 0) return null;
        const displayValue = nextValue > max ? `${max}+` : nextValue.toString();

        return (
            <span
                className={cn(
                    'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-label font-semibold leading-none',
                    className,
                )}
                style={{
                    backgroundColor: backgroundColor,
                    ...style,
                }}
                {...props}
            >
                {displayValue}
            </span>
        );
    }

    return (
        <span
            className={cn('inline-block h-2 w-2 rounded-full', className)}
            style={{
                backgroundColor: backgroundColor,
                ...style,
            }}
            {...props}
        />
    );
};
