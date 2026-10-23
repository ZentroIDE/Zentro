// SPDX-License-Identifier: GPL-3.0-only

import React, { createContext, useContext, useMemo } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toast as sonnerToast, Toaster, type ToasterProps } from 'sonner';
import { ToastVariant } from '../../lib/enums';
import { recordNotification, type NotificationOptions } from '../../lib/notifications';
import type { NotificationAction } from '../../stores/notificationStore';
import { Button } from '../ui';

export { ToastVariant };

export interface ToastNotifyOptions extends NotificationOptions {
    id?: string;
}

export interface ToastApi {
    success: (
        msg: string,
        idOrOptions?: string | ToastNotifyOptions,
        maybeOptions?: ToastNotifyOptions,
    ) => void;
    error: (
        msg: string,
        idOrOptions?: string | ToastNotifyOptions,
        maybeOptions?: ToastNotifyOptions,
    ) => void;
    info: (
        msg: string,
        idOrOptions?: string | ToastNotifyOptions,
        maybeOptions?: ToastNotifyOptions,
    ) => void;
}

interface ToastContextValue {
    toast: ToastApi;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');
    return ctx;
};

export type ToastPlacement =
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';

interface ToastProviderProps {
    children: React.ReactNode;
    placement?: ToastPlacement;
}

function normalizeToastOptions(
    idOrOptions?: string | ToastNotifyOptions,
    maybeOptions?: ToastNotifyOptions,
): ToastNotifyOptions | undefined {
    if (typeof idOrOptions === 'string') {
        return {
            ...maybeOptions,
            id: idOrOptions,
        };
    }

    if (idOrOptions) {
        return idOrOptions;
    }

    return maybeOptions;
}

function ToastBody({
    message,
    icon: Icon,
    iconClassName,
    actions,
    close,
}: {
    message: string;
    icon: typeof CheckCircle;
    iconClassName: string;
    actions?: NotificationAction[];
    close: () => void;
}) {
    const visibleActions = actions?.slice(0, 2) ?? [];

    return (
        <div className='relative pointer-events-auto flex min-w-[280px] max-w-[520px] items-start gap-2 rounded-md border border-border/70 bg-card px-6 py-5 pr-12 text-section shadow-elevation-md'>
            <Icon size={18} className={cn('mt-px shrink-0', iconClassName)} />
            <div className='min-w-0 flex-1'>
                <p className='break-words pr-1 leading-[1.35] text-section font-semibold text-foreground'>
                    {message}
                </p>
                {visibleActions.length > 0 && (
                    <div className='mt-3 flex flex-wrap items-center gap-2'>
                        {visibleActions.map(action => (
                            <Button
                                key={action.id}
                                type='button'
                                variant='secondary'
                                size='sm'
                                className='h-7 px-2.5'
                                onClick={() => {
                                    close();
                                    void Promise.resolve(action.run()).catch(() => {});
                                }}
                            >
                                {action.label}
                            </Button>
                        ))}
                    </div>
                )}
            </div>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className='absolute right-2 top-2 h-8 w-8 text-muted-foreground'
                aria-label='Dismiss notification'
                onClick={close}
            >
                <X size={16} />
            </Button>
        </div>
    );
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
    children,
    placement = 'bottom-left',
}) => {
    const addToast = React.useCallback(
        (
            message: string,
            variant: ToastVariant,
            idOrOptions?: string | ToastNotifyOptions,
            maybeOptions?: ToastNotifyOptions,
        ) => {
            const options = normalizeToastOptions(idOrOptions, maybeOptions);
            const variantStyle = {
                [ToastVariant.SUCCESS]: { icon: 'text-success', Icon: CheckCircle },
                [ToastVariant.ERROR]: { icon: 'text-destructive', Icon: AlertCircle },
                [ToastVariant.INFO]: { icon: 'text-accent', Icon: Info },
            }[variant];
            const Icon = variantStyle.Icon;

            recordNotification(variant, message, options);

            sonnerToast.custom(
                toastId => (
                    <ToastBody
                        message={message}
                        icon={Icon}
                        iconClassName={variantStyle.icon}
                        actions={options?.actions}
                        close={() => sonnerToast.dismiss(toastId)}
                    />
                ),
                options?.id ? { id: options.id } : undefined,
            );
        },
        [],
    );

    const toast = useMemo(
        () => ({
            success: (
                msg: string,
                idOrOptions?: string | ToastNotifyOptions,
                maybeOptions?: ToastNotifyOptions,
            ) => addToast(msg, ToastVariant.SUCCESS, idOrOptions, maybeOptions),
            error: (
                msg: string,
                idOrOptions?: string | ToastNotifyOptions,
                maybeOptions?: ToastNotifyOptions,
            ) => addToast(msg, ToastVariant.ERROR, idOrOptions, maybeOptions),
            info: (
                msg: string,
                idOrOptions?: string | ToastNotifyOptions,
                maybeOptions?: ToastNotifyOptions,
            ) => addToast(msg, ToastVariant.INFO, idOrOptions, maybeOptions),
        }),
        [addToast],
    );

    const position = placement as NonNullable<ToasterProps['position']>;

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <Toaster
                position={position}
                className='z-toast'
                visibleToasts={3}
                duration={4000}
                offset={{ top: 56, right: 16, bottom: 36, left: 16 }}
            />
        </ToastContext.Provider>
    );
};
