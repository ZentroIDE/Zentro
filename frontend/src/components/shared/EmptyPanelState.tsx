// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { cn } from '../../lib/cn';

interface EmptyPanelStateProps {
    icon: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    secondaryDescription?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

export const EmptyPanelState: React.FC<EmptyPanelStateProps> = ({
    icon,
    title,
    description,
    secondaryDescription,
    action,
    className,
}) => {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center h-full px-4 text-center text-muted-foreground gap-2',
                className,
            )}
        >
            <div className='opacity-30'>{icon}</div>
            <div className='max-w-[320px]'>
                <p className='m-0 text-body font-medium text-foreground'>{title}</p>
                <p className='m-0 mt-1 text-small'>{description}</p>
                {secondaryDescription ? (
                    <p className='m-0 mt-1 text-label text-muted-foreground'>
                        {secondaryDescription}
                    </p>
                ) : null}
            </div>
            {action ? <div className='mt-1'>{action}</div> : null}
        </div>
    );
};
