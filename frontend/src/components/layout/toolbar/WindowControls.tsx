// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { WindowIsMaximised } from '../../../../wailsjs/runtime/runtime';
import { Button } from '../../ui';
import { cn } from '../../../lib/cn';

interface WindowControlsProps {
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}

const MinimizeIcon = () => <Minus width={10} height={10} strokeWidth={1} />;

const MaximizeIcon = () => <Square width={10} height={10} strokeWidth={1} />;

const RestoreIcon = () => <Copy width={11} height={11} strokeWidth={1} />;

const CloseIcon = () => (
    <svg
        width='10'
        height='10'
        viewBox='0 0 10 10'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.1'
        strokeLinecap='round'
    >
        <line x1='0' y1='0' x2='10' y2='10' />
        <line x1='10' y1='0' x2='0' y2='10' />
    </svg>
);

export const WindowControls: React.FC<WindowControlsProps> = ({
    onMinimize,
    onToggleMaximize,
    onClose,
}) => {
    const [isMaximised, setIsMaximised] = useState(false);

    const syncMaximisedState = useCallback(() => {
        void WindowIsMaximised()
            .then(maximised => setIsMaximised(Boolean(maximised)))
            .catch(() => {
                // No-op in non-runtime environments.
            });
    }, []);

    useEffect(() => {
        syncMaximisedState();
        const handleWindowChange = () => syncMaximisedState();
        window.addEventListener('resize', handleWindowChange);
        window.addEventListener('focus', handleWindowChange);
        return () => {
            window.removeEventListener('resize', handleWindowChange);
            window.removeEventListener('focus', handleWindowChange);
        };
    }, [syncMaximisedState]);

    const handleToggleMaximize = () => {
        onToggleMaximize();
        window.setTimeout(syncMaximisedState, 80);
    };

    const btnBase =
        'flex items-center justify-center h-full w-[46px] text-foreground/70 transition-colors duration-100 select-none';

    return (
        <div className='absolute top-0 right-0 flex items-stretch h-7'>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className={`${btnBase} rounded-none ui-interactive-surface`}
                title='Minimize'
                onClick={onMinimize}
            >
                <MinimizeIcon />
            </Button>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className={`${btnBase} rounded-none ui-interactive-surface`}
                title={isMaximised ? 'Restore' : 'Maximize'}
                onClick={handleToggleMaximize}
            >
                {isMaximised ? <RestoreIcon /> : <MaximizeIcon />}
            </Button>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className={cn(btnBase, 'rounded-none ui-interactive-ghost-destructive')}
                title='Close'
                onClick={onClose}
            >
                <CloseIcon />
            </Button>
        </div>
    );
};
