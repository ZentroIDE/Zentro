// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CLICKABLE_FOCUS_CLASS } from './contract';

const RadioGroup = React.forwardRef<
    React.ElementRef<typeof RadioGroupPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
    <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
    React.ElementRef<typeof RadioGroupPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
    <RadioGroupPrimitive.Item
        ref={ref}
        className={cn(
            'aspect-square [height:var(--control-height-micro)] [width:var(--control-height-micro)] rounded-full border border-input text-primary',
            CLICKABLE_FOCUS_CLASS,
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
        )}
        {...props}
    >
        <RadioGroupPrimitive.Indicator className='flex items-center justify-center'>
            <Circle className='h-2 w-2 fill-current text-current' />
        </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
