// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { cn } from '../../lib/cn';
import { Button } from '../ui';

interface IconTabBarItem<T extends string> {
    value: T;
    icon: React.ReactNode;
    title: string;
}

interface IconTabBarProps<T extends string> {
    value: T;
    items: Array<IconTabBarItem<T>>;
    onChange: (value: T) => void;
    trailingActions?: React.ReactNode;
    className?: string;
}

export function IconTabBar<T extends string>({
    value,
    items,
    onChange,
    trailingActions,
    className,
}: IconTabBarProps<T>) {
    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            {items.map(item => {
                const active = item.value === value;
                return (
                    <Button
                        key={item.value}
                        type='button'
                        variant='ghost'
                        size='icon'
                        className={cn(
                            'h-8 w-8 rounded-md',
                            active
                                ? 'text-accent bg-accent/10'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => onChange(item.value)}
                        title={item.title}
                    >
                        {item.icon}
                    </Button>
                );
            })}
            {trailingActions ? (
                <div className='ml-auto flex items-center gap-1.5'>{trailingActions}</div>
            ) : null}
        </div>
    );
}
