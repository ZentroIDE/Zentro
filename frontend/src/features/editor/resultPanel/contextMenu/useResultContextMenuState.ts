// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { ResultContextMenuPayload } from '../types';

export function useResultContextMenuState(resetSignature?: string) {
    const [contextMenu, setContextMenu] = React.useState<ResultContextMenuPayload | null>(null);
    const contextMenuRef = React.useRef<HTMLDivElement>(null);

    const closeContextMenu = React.useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleCellContextMenu = React.useCallback((payload: ResultContextMenuPayload) => {
        setContextMenu(payload);
    }, []);

    React.useEffect(() => {
        if (!contextMenu) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (contextMenuRef.current?.contains(event.target as Node)) return;
            setContextMenu(null);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setContextMenu(null);
        };
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', closeContextMenu);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', closeContextMenu);
        };
    }, [closeContextMenu, contextMenu]);

    React.useEffect(() => {
        setContextMenu(null);
    }, [resetSignature]);

    const contextMenuPosition = React.useMemo(() => {
        if (!contextMenu || typeof window === 'undefined') return null;
        const menuWidth = 224;
        const submenuWidth = 224;
        const estimatedHeight = 320;
        const spaceRight = window.innerWidth - contextMenu.x;
        const needsSubmenuSpace = spaceRight < menuWidth + submenuWidth + 8;
        const effectiveWidth = menuWidth + submenuWidth + 8;
        const left = Math.min(contextMenu.x, window.innerWidth - effectiveWidth - 8);
        const top = Math.min(contextMenu.y, window.innerHeight - estimatedHeight - 8);
        return {
            left: Math.max(8, left),
            top: Math.max(8, top),
            submenuOpensLeft: needsSubmenuSpace,
        };
    }, [contextMenu]);

    return {
        contextMenu,
        setContextMenu,
        contextMenuRef,
        contextMenuPosition,
        closeContextMenu,
        handleCellContextMenu,
    };
}
