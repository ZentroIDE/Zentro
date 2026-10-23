// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import {
    CLICKABLE_FOCUS_CLASS,
    STATE_CLASS,
    TONE_CLASS,
    interactiveCheckedControl,
    normalizeControlSize,
    type ControlSizeInput,
    type DesignSystemControlProps,
} from './contract';

const switchVariants = cva(
    'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-border bg-secondary transition-colors duration-fast outline-none',
    {
        variants: {
            size: {
                default: '[height:var(--control-height-default)] w-10',
                micro: '[height:var(--control-height-micro)] w-8',
            },
        },
        defaultVariants: {
            size: 'default',
        },
    },
);

const switchThumbVariants = cva(
    'pointer-events-none block rounded-full border border-border bg-background shadow-lg ring-0 transition-transform',
    {
        variants: {
            size: {
                default:
                    'h-[18px] w-[18px] data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]',
                micro: 'h-4 w-4 data-[state=checked]:translate-x-[12px] data-[state=unchecked]:translate-x-[2px]',
            },
        },
        defaultVariants: {
            size: 'default',
        },
    },
);

interface SwitchProps
    extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>, DesignSystemControlProps {
    size?: ControlSizeInput;
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
    ({ className, tone = 'default', state = 'default', size = 'default', ...props }, ref) => {
        const normalizedSize = normalizeControlSize(size);
        return (
            <SwitchPrimitives.Root
                ref={ref}
                data-tone={tone}
                data-ui-state={state}
                disabled={props.disabled || state === 'disabled'}
                aria-busy={state === 'loading' ? true : undefined}
                className={cn(
                    CLICKABLE_FOCUS_CLASS,
                    interactiveCheckedControl,
                    'disabled:cursor-not-allowed',
                    switchVariants({ size: normalizedSize }),
                    TONE_CLASS[tone],
                    STATE_CLASS[state],
                    className,
                )}
                {...props}
            >
                <SwitchPrimitives.Thumb
                    className={cn(
                        switchThumbVariants({ size: normalizedSize }),
                        'data-[state=checked]:border-primary-foreground',
                    )}
                />
            </SwitchPrimitives.Root>
        );
    },
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
