// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    menuItemCompactClass,
} from '../../ui';
import { useImageColumnStore } from '../../../stores/imageColumnStore';

interface ImageColumnHeaderMenuProps {
    columnName: string;
    /** Undefined for ad-hoc query tabs — the feature is inert there (no
     *  stable table/column identity to key persistence on), so the header
     *  renders without a context menu at all. */
    connectionKey?: string;
    tableKey?: string;
    children: React.ReactElement;
}

export const ImageColumnHeaderMenu: React.FC<ImageColumnHeaderMenuProps> = ({
    columnName,
    connectionKey,
    tableKey,
    children,
}) => {
    const marked = useImageColumnStore(state =>
        connectionKey && tableKey && state.activeScopeKey === connectionKey
            ? (state.byTable[tableKey]?.has(columnName) ?? false)
            : false,
    );
    const toggleMark = useImageColumnStore(state => state.toggleMark);

    if (!connectionKey || !tableKey) return children;

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem
                    className={menuItemCompactClass}
                    onSelect={() => void toggleMark(connectionKey, tableKey, columnName)}
                >
                    {marked ? 'Unmark as Image Column' : 'Mark as Image Column'}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};
