// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';
import { CLICKABLE_FOCUS_CLASS } from './contract';

const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex w-full touch-none select-none items-center', className)}
        {...props}
    >
        <SliderPrimitive.Track className='relative h-1.5 w-full grow overflow-hidden rounded-full border border-border/60 bg-muted'>
            <SliderPrimitive.Range className='absolute h-full bg-primary' />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
            className={cn(
                'block [height:var(--control-height-micro)] [width:var(--control-height-micro)] rounded-full border border-primary/45 bg-background shadow-sm transition-colors',
                CLICKABLE_FOCUS_CLASS,
                'disabled:pointer-events-none disabled:opacity-50',
            )}
        />
    </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
