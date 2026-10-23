// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { isTableLike, type SearchItem } from '../../../lib/contextSearchTemplates';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '../../ui';

export type ContextSearchAction = 'browse' | 'select' | 'insert' | 'update' | 'alter' | 'open';

interface SearchResultContextMenuProps {
    open: boolean;
    position: { x: number; y: number } | null;
    item: SearchItem | null;
    onOpenChange: (open: boolean) => void;
    onAction: (item: SearchItem, action: ContextSearchAction) => void;
}

export const SearchResultContextMenu: React.FC<SearchResultContextMenuProps> = ({
    open,
    position,
    item,
    onOpenChange,
    onAction,
}) => {
    const triggerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open || !position) return;
        const trigger = triggerRef.current;
        if (!trigger) return;
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: position.x,
            clientY: position.y,
        });
        trigger.dispatchEvent(event);
    }, [open, position]);

    // The menu is anchored to a static clientX/clientY snapshot taken at
    // right-click time, not to the row itself — if the results list scrolls
    // while it's open, the menu stays put and visibly detaches from the item
    // it was opened for. Closing on scroll (capture phase, since scroll
    // doesn't bubble) matches how native context menus behave instead of
    // leaving a stale menu floating over the wrong row.
    React.useEffect(() => {
        if (!open) return;
        const handleScroll = () => onOpenChange(false);
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [open, onOpenChange]);

    if (!open || !position || !item) {
        return null;
    }

    return (
        <div
            className='fixed z-panel-overlay pointer-events-none'
            style={{ left: position.x, top: position.y }}
        >
            {/* Non-modal ContextMenu (see below) lets outside pointerdowns
                pass through to whatever row is underneath, which both closes
                the menu AND selects that row in one click. This backdrop
                swallows the outside click so it only closes the menu. */}
            <div
                className='fixed inset-0 pointer-events-auto'
                onMouseDown={event => {
                    event.stopPropagation();
                    onOpenChange(false);
                }}
            />
            <ContextMenu modal={false} onOpenChange={onOpenChange}>
                <ContextMenuTrigger asChild>
                    <div ref={triggerRef} className='h-px w-px' />
                </ContextMenuTrigger>
                <ContextMenuContent className='w-40 pointer-events-auto z-topmost'>
                    {isTableLike(item.kind) ? (
                        <>
                            <ContextMenuItem onSelect={() => onAction(item, 'browse')}>
                                Browse
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => onAction(item, 'select')}>
                                Select
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => onAction(item, 'insert')}>
                                Insert
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => onAction(item, 'update')}>
                                Update
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => onAction(item, 'alter')}>
                                Alter
                            </ContextMenuItem>
                        </>
                    ) : (
                        <ContextMenuItem onSelect={() => onAction(item, 'open')}>
                            Open
                        </ContextMenuItem>
                    )}
                </ContextMenuContent>
            </ContextMenu>
        </div>
    );
};
