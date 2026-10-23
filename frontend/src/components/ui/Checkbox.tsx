// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CLICKABLE_FOCUS_CLASS, interactiveCheckedControl } from './contract';

const Checkbox = React.forwardRef<
    React.ElementRef<typeof CheckboxPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
            'peer [height:var(--control-height-micro)] [width:var(--control-height-micro)] shrink-0 rounded-md border border-input bg-background shadow-xs transition-colors duration-fast',
            CLICKABLE_FOCUS_CLASS,
            interactiveCheckedControl,
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator className='flex items-center justify-center text-current'>
            <Check className='h-2.5 w-2.5' />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
