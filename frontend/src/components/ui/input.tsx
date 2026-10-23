// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import { cn } from '@/lib/cn';
import {
    CONTROL_SIZE_CLASS,
    DENSITY_CLASS,
    STATE_CLASS,
    TONE_CLASS,
    TEXT_ENTRY_FOCUS_CLASS,
    controlSurface,
    interactiveGhostField,
    normalizeControlSize,
    type ControlSizeInput,
    type DesignSystemControlProps,
} from './contract';

// variant: default = bordered bg-background
//          ghost   = subtle bg-muted/40, for search bars embedded in toolbars
export type InputVariant = 'default' | 'ghost';

const VARIANT_CLASS: Record<InputVariant, string> = {
    default: controlSurface,
    ghost: interactiveGhostField,
};

interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, DesignSystemControlProps {
    size?: ControlSizeInput;
    variant?: InputVariant;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    (
        {
            className,
            type,
            tone = 'default',
            state = 'default',
            density = 'compact',
            size = 'default',
            variant = 'default',
            ...props
        },
        ref,
    ) => {
        const disabled = props.disabled || state === 'disabled';
        const normalizedSize = normalizeControlSize(size);
        return (
            <input
                type={type}
                data-tone={tone}
                data-state={state}
                disabled={disabled}
                aria-busy={state === 'loading' ? true : undefined}
                className={cn(
                    'flex w-full rounded-md border font-sans text-foreground transition-colors duration-fast outline-none',
                    'placeholder:text-muted-foreground',
                    TEXT_ENTRY_FOCUS_CLASS,
                    'file:border-0 file:bg-transparent file:font-medium file:text-foreground',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    CONTROL_SIZE_CLASS[normalizedSize],
                    VARIANT_CLASS[variant],
                    DENSITY_CLASS[density],
                    TONE_CLASS[tone],
                    STATE_CLASS[state],
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = 'Input';

export { Input };
export type { ControlSize as InputSize, ControlSizeInput as InputSizeInput } from './contract';
