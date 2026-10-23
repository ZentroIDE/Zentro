// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import {
    BUTTON_FOCUS_CLASS,
    BUTTON_TONE_CLASS,
    DENSITY_CLASS,
    STATE_CLASS,
    buttonDestructive,
    buttonEmphasis,
    buttonGhost,
    buttonLink,
    buttonOutline,
    buttonSurface,
} from './contract';

type ButtonSize = 'default' | 'icon' | 'micro';
type LegacyButtonSize = 'sm' | 'md' | 'lg' | 'icon-xs' | 'icon-sm' | 'icon-md';
type ButtonSizeInput = ButtonSize | LegacyButtonSize;
type ButtonContent = 'text' | 'mixed' | 'icon-only';

const normalizeButtonSize = (size?: ButtonSizeInput): ButtonSize => {
    if (!size) return 'default';
    if (size === 'micro' || size === 'icon') return size;
    if (size === 'icon-xs') return 'micro';
    if (size === 'icon-sm' || size === 'icon-md') return 'icon';
    return 'default';
};

const getButtonContent = (children: React.ReactNode): ButtonContent => {
    const parts = React.Children.toArray(children).filter(child => {
        if (typeof child === 'boolean' || child === null || child === undefined) return false;
        if (typeof child === 'string') return child.trim().length > 0;
        return true;
    });
    const hasText = parts.some(child => typeof child === 'string' || typeof child === 'number');
    const elementCount = parts.filter(child => React.isValidElement(child)).length;

    if (!hasText && elementCount <= 1) return 'icon-only';
    if (hasText && elementCount === 0) return 'text';
    return 'mixed';
};

export const buttonVariants = cva(
    cn(
        'inline-flex min-w-0 items-center justify-center whitespace-nowrap [border-radius:var(--btn-radius)] border font-sans font-normal leading-none transition-colors duration-fast cursor-pointer select-none',
        BUTTON_FOCUS_CLASS,
        'disabled:pointer-events-none disabled:opacity-55',
    ),
    {
        variants: {
            variant: {
                default: buttonEmphasis,
                secondary: buttonSurface,
                destructive: buttonDestructive,
                ghost: buttonGhost,
                outline: buttonOutline,
                link: cn('h-auto px-0 underline-offset-4', buttonLink),
            },
            size: {
                default: '[height:var(--control-height-default)] ui-text-small',
                icon: '[height:var(--control-height-icon)] [width:var(--control-height-icon)] p-0 ui-text-small',
                micro: '[height:var(--control-height-micro)] ui-text-small',
            },
            layout: {
                text: '',
                mixed: '',
                'icon-only': '',
            },
            density: {
                compact: DENSITY_CLASS.compact,
            },
            tone: {
                default: '',
                neutral: '',
                success: '',
                warning: '',
                destructive: '',
                info: '',
            },
            state: {
                default: STATE_CLASS.default,
                loading: STATE_CLASS.loading,
                error: STATE_CLASS.error,
                disabled: STATE_CLASS.disabled,
            },
        },
        compoundVariants: [
            {
                size: 'default',
                layout: 'text',
                className:
                    '[padding-left:var(--control-px-default)] [padding-right:var(--control-px-default)]',
            },
            {
                size: 'default',
                layout: 'mixed',
                className:
                    'gap-1.5 [padding-left:var(--control-px-default)] [padding-right:var(--control-px-default-icon-end)] [&_svg]:size-3 [&_[data-slot=icon]]:size-3',
            },
            {
                size: 'default',
                layout: 'icon-only',
                className: '[&_svg]:size-3 [&_[data-slot=icon]]:size-3',
            },
            {
                size: 'micro',
                layout: 'text',
                className:
                    '[padding-left:var(--control-px-micro)] [padding-right:var(--control-px-micro)]',
            },
            {
                size: 'micro',
                layout: 'mixed',
                className:
                    'gap-1 [padding-left:var(--control-px-micro)] [padding-right:calc(var(--control-px-micro)+1px)] [&_svg]:size-2.5 [&_[data-slot=icon]]:size-2.5',
            },
            {
                size: 'micro',
                layout: 'icon-only',
                className:
                    '[width:var(--control-height-micro)] p-0 [&_svg]:size-2.5 [&_[data-slot=icon]]:size-2.5',
            },
            {
                size: 'icon',
                className: '[&_svg]:size-3 [&_[data-slot=icon]]:size-3',
            },
            {
                variant: 'link',
                className: 'gap-1.5',
            },
            {
                variant: 'default',
                tone: 'default',
                className: BUTTON_TONE_CLASS.default.default,
            },
            {
                variant: 'default',
                tone: 'success',
                className: BUTTON_TONE_CLASS.default.success,
            },
            {
                variant: 'default',
                tone: 'warning',
                className: BUTTON_TONE_CLASS.default.warning,
            },
            {
                variant: 'default',
                tone: 'destructive',
                className: BUTTON_TONE_CLASS.default.destructive,
            },
            {
                variant: 'default',
                tone: 'neutral',
                className: BUTTON_TONE_CLASS.default.neutral,
            },
            {
                variant: 'default',
                tone: 'info',
                className: BUTTON_TONE_CLASS.default.info,
            },
            {
                variant: 'secondary',
                tone: 'success',
                className: BUTTON_TONE_CLASS.secondary.success,
            },
            {
                variant: 'secondary',
                tone: 'warning',
                className: BUTTON_TONE_CLASS.secondary.warning,
            },
            {
                variant: 'secondary',
                tone: 'destructive',
                className: BUTTON_TONE_CLASS.secondary.destructive,
            },
            {
                variant: 'secondary',
                tone: 'info',
                className: BUTTON_TONE_CLASS.secondary.info,
            },
            {
                variant: 'outline',
                tone: 'success',
                className: BUTTON_TONE_CLASS.outline.success,
            },
            {
                variant: 'outline',
                tone: 'warning',
                className: BUTTON_TONE_CLASS.outline.warning,
            },
            {
                variant: 'outline',
                tone: 'destructive',
                className: BUTTON_TONE_CLASS.outline.destructive,
            },
            {
                variant: 'outline',
                tone: 'info',
                className: BUTTON_TONE_CLASS.outline.info,
            },
            {
                variant: 'ghost',
                tone: 'success',
                className: BUTTON_TONE_CLASS.ghost.success,
            },
            {
                variant: 'ghost',
                tone: 'warning',
                className: BUTTON_TONE_CLASS.ghost.warning,
            },
            {
                variant: 'ghost',
                tone: 'destructive',
                className: BUTTON_TONE_CLASS.ghost.destructive,
            },
            {
                variant: 'ghost',
                tone: 'info',
                className: BUTTON_TONE_CLASS.ghost.info,
            },
            {
                variant: 'link',
                tone: 'success',
                className: BUTTON_TONE_CLASS.link.success,
            },
            {
                variant: 'link',
                tone: 'warning',
                className: BUTTON_TONE_CLASS.link.warning,
            },
            {
                variant: 'link',
                tone: 'destructive',
                className: BUTTON_TONE_CLASS.link.destructive,
            },
            {
                variant: 'link',
                tone: 'info',
                className: BUTTON_TONE_CLASS.link.info,
            },
        ],
        defaultVariants: {
            variant: 'secondary',
            size: 'default',
            layout: 'text',
            density: 'compact',
            tone: 'default',
            state: 'default',
        },
    },
);

export interface ButtonProps
    extends
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        Omit<VariantProps<typeof buttonVariants>, 'size'> {
    asChild?: boolean;
    size?: ButtonSizeInput;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant,
            size,
            density = 'compact',
            tone = 'default',
            state = 'default',
            asChild = false,
            children,
            ...props
        },
        ref,
    ) => {
        const Comp = asChild ? Slot : 'button';
        const disabled = props.disabled || state === 'disabled';
        const normalizedSize = normalizeButtonSize(size);
        const content = getButtonContent(children);

        return (
            <Comp
                data-tone={tone}
                data-state={state}
                data-size={normalizedSize}
                data-content={content}
                disabled={disabled}
                aria-busy={state === 'loading' ? true : undefined}
                className={cn(
                    buttonVariants({
                        variant,
                        size: normalizedSize,
                        layout: content,
                        density,
                        tone,
                        state,
                        className,
                    }),
                )}
                ref={ref}
                {...props}
            >
                {children}
            </Comp>
        );
    },
);

Button.displayName = 'Button';

export { Button };
