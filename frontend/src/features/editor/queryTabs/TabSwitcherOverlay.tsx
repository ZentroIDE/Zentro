// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { cn } from '../../../lib/cn';
import type { Tab } from '../../../stores/editorStore';
import { PinnedEnvironmentBadge } from '../../../components/shared/PinnedEnvironmentBadge';

interface TabSwitcherOverlayProps {
    open: boolean;
    orderedIds: string[];
    index: number;
    tabMetaById: Map<string, { tab: Tab; groupId: string }>;
    /** Activate a tab immediately and close the switcher (mouse click on a row). */
    onSelect: (tabId: string) => void;
}

export const TabSwitcherOverlay: React.FC<TabSwitcherOverlayProps> = ({
    open,
    orderedIds,
    index,
    tabMetaById,
    onSelect,
}) => {
    if (!open || orderedIds.length === 0) {
        return null;
    }

    return (
        <div className='fixed left-1/2 top-40 z-topmost -translate-x-1/2 pointer-events-none'>
            <div className='min-w-70 max-w-140 max-h-70 overflow-auto rounded-md border border-border/60 bg-card/95 shadow-elevation-sm backdrop-blur-sm pointer-events-auto p-2'>
                {orderedIds.map((id, itemIndex) => {
                    const meta = tabMetaById.get(id);
                    if (!meta) return null;
                    const isSelected = itemIndex === index;
                    const connection = meta.tab.connection;

                    return (
                        <div
                            key={id}
                            role='option'
                            aria-selected={isSelected}
                            onClick={() => onSelect(id)}
                            className={cn(
                                'flex items-center gap-2 rounded-md px-2 py-1.5 text-small cursor-pointer',
                                isSelected
                                    ? 'bg-accent/25 text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                            )}
                        >
                            {connection && (
                                <PinnedEnvironmentBadge connection={connection} truncate />
                            )}
                            <span className='truncate flex-1'>{meta.tab.name}</span>
                            <span className='text-label text-muted-foreground'>
                                {meta.tab.type || 'query'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
