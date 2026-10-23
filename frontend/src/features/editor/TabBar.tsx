// SPDX-License-Identifier: GPL-3.0-only

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, SplitSquareHorizontal, Table2, Columns2, Hash } from 'lucide-react';
import { Tab } from '../../stores/editorStore';
import { DOM_EVENT } from '../../lib/constants';
import { onCommand } from '../../lib/commandBus';
import { useFocusZone } from '../../lib/focusZoneRegistry';
import { useSmoothWheelScroll } from '../../hooks/useSmoothWheelScroll';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '../../lib/cn';
import { useToast } from '../../components/layout/Toast';
import {
    Button,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    Input,
    TAB_STRIP_BAR_CLASS,
    TAB_STRIP_ITEM_CLASS,
    TAB_STRIP_ITEM_ACTIVE_CLASS,
} from '../../components/ui';
import { PinnedEnvironmentBadge } from '../../components/shared/PinnedEnvironmentBadge';
import { useTableInfoUnsavedChanges } from './TableInfo/tableInfoCloseRegistry';
import { useResultHasUnsavedChanges } from './resultPanel/useResultHasUnsavedChanges';
import { useShortcutHint } from '../../lib/shortcutDisplay';

interface TabBarProps {
    groupId: string;
    tabs: Tab[];
    activeTabId: string | null;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onNewTab: () => void;
    onRename: (id: string, newName: string) => void;
    onSplit?: (tabId: string) => void;
}

const canRenameTab = (tab: Tab): boolean => tab.type === 'query';

// ── Sortable Tab Item ──────────────────────────────────────────────────
interface SortableTabItemProps {
    tab: Tab;
    groupId: string;
    isActive: boolean;
    renamingId: string | null;
    renameValue: string;
    renameInputRef: React.RefObject<HTMLInputElement>;
    onActivate: () => void;
    onDoubleClick: () => void;
    onRenameChange: (val: string) => void;
    onRenameBlur: () => void;
    onRenameKeyDown: (e: React.KeyboardEvent) => void;
    onClose: () => void;
    activeTabRef?: React.RefObject<HTMLDivElement | null>;
}

const SortableTabItem: React.FC<SortableTabItemProps> = ({
    tab,
    groupId,
    isActive,
    renamingId,
    renameValue,
    renameInputRef,
    onActivate,
    onDoubleClick,
    onRenameChange,
    onRenameBlur,
    onRenameKeyDown,
    onClose,
    activeTabRef,
}) => {
    // Table tabs report through their close controller (columns, keys, data…);
    // query tabs only have edits in their result grid.
    const tableHasUnsavedChanges = useTableInfoUnsavedChanges(tab.id);
    const resultHasUnsavedChanges = useResultHasUnsavedChanges(tab.id);
    const hasUnsavedChanges = tableHasUnsavedChanges || resultHasUnsavedChanges;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: tab.id,
        data: {
            type: 'Tab',
            tab,
            groupId,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'var(--layer-drag)' : undefined,
    };

    return (
        <div
            ref={node => {
                setNodeRef(node);
                if (isActive && activeTabRef) {
                    (activeTabRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                }
            }}
            data-tab-id={tab.id}
            style={style}
            {...attributes}
            {...listeners}
            tabIndex={isActive ? 0 : -1}
            role='tab'
            aria-selected={isActive}
            className={cn(
                TAB_STRIP_ITEM_CLASS,
                'rounded-md ui-focus-ring',
                isActive && TAB_STRIP_ITEM_ACTIVE_CLASS,
                // The DragOverlay clone is the moving element the user tracks
                // (see QueryTabs.tsx) — leaving this source slot fully opaque
                // reads as a stuck duplicate tab, so it becomes a dashed
                // placeholder outline instead while the drag is in flight.
                isDragging && 'opacity-40! bg-transparent! border border-dashed border-border',
            )}
            onClick={onActivate}
            onDoubleClick={onDoubleClick}
            onKeyDown={event => {
                // dnd-kit's KeyboardSensor (see useQueryTabsDnD.ts) also
                // listens on this element via `listeners.onKeyDown` — Space
                // is reserved for picking the tab up to reorder it, so only
                // Enter activates the tab (not Space, to avoid fighting
                // over the same key).
                listeners?.onKeyDown?.(event);
                if (renamingId === tab.id || event.defaultPrevented) return;
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onActivate();
                }
            }}
        >
            {hasUnsavedChanges && (
                <span
                    className='h-1.5 w-1.5 shrink-0 rounded-full bg-warning'
                    aria-label='Unsaved changes'
                    title='Unsaved changes'
                />
            )}
            {renamingId === tab.id ? (
                <Input
                    ref={renameInputRef}
                    className='rt-cell-input h-[24px]! px-1.5! text-small! min-w-30 font-sans'
                    value={renameValue}
                    onChange={e => onRenameChange(e.target.value)}
                    onBlur={onRenameBlur}
                    onKeyDown={onRenameKeyDown}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => e.stopPropagation()}
                />
            ) : (
                <span
                    className='flex items-center gap-1 overflow-hidden text-ellipsis'
                    title={tab.name}
                >
                    {tab.connection && (
                        <PinnedEnvironmentBadge connection={tab.connection} truncate />
                    )}
                    {tab.type === 'table' && <Table2 size={12} />}
                    {tab.type === 'catalog' && <Hash size={12} />}
                    {tab.type === 'compare' && <Columns2 size={12} />}
                    {tab.name}
                </span>
            )}
            {tab.isRunning && (
                <span
                    className='w-1.5 h-1.5 rounded-full bg-success shrink-0 animate-pulse'
                    title='Running'
                />
            )}
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-5 w-5 p-0.5 text-muted-foreground opacity-0 transition-opacity duration-100 shrink-0 group-hover:opacity-100 ui-interactive-surface'
                onClick={e => {
                    e.stopPropagation();
                    onClose();
                }}
                onPointerDown={e => e.stopPropagation()} // Prevent drag start when clicking close
                tabIndex={-1}
                title='Close tab'
            >
                <X size={12} />
            </Button>
        </div>
    );
};

// ── Tab Bar ─────────────────────────────────────────────────────────────
export const TabBar: React.FC<TabBarProps> = ({
    groupId,
    tabs,
    activeTabId,
    onActivate,
    onClose,
    onNewTab,
    onRename,
    onSplit,
}) => {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const { toast } = useToast();
    const renameInputRef = useRef<HTMLInputElement>(null);
    const tabsScrollRef = useRef<HTMLDivElement>(null);
    const newTabHint = useShortcutHint('editor.newTab');
    const activeTabRef = useRef<HTMLDivElement | null>(null);
    useFocusZone('tabStrip', activeTabRef);

    // Make the empty space droppable for cross-group drags to an empty pane
    const { setNodeRef: setDroppableRef } = useDroppable({
        id: `group-drop-${groupId}`,
        data: {
            type: 'Group',
            groupId,
        },
    });

    // Auto-focus rename input
    useEffect(() => {
        if (renamingId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingId]);

    // Auto-scroll active tab into view
    useEffect(() => {
        if (!activeTabId || !tabsScrollRef.current) return;
        const activeEl = tabsScrollRef.current.querySelector<HTMLElement>(
            `[data-tab-id="${window.CSS.escape(activeTabId)}"]`,
        );
        activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, [activeTabId]);

    // Convert vertical wheel to horizontal scroll (VS Code style), eased.
    useSmoothWheelScroll(tabsScrollRef, { axis: 'x' });

    // Listen to F2 rename custom hook
    useEffect(() => {
        const off = onCommand(DOM_EVENT.RENAME_TAB, tabId => {
            const tab = tabs.find(t => t.id === tabId);
            if (tab && canRenameTab(tab)) {
                setRenamingId(tab.id);
                setRenameValue(tab.name);
            }
        });
        return off;
    }, [tabs]);

    const startRename = useCallback((tab: Tab) => {
        if (!canRenameTab(tab)) return;
        setRenamingId(tab.id);
        setRenameValue(tab.name);
    }, []);

    const commitRename = useCallback(() => {
        if (!renamingId) {
            setRenamingId(null);
            return;
        }

        const nextName = renameValue.trim();
        if (!nextName) {
            setRenamingId(null);
            return;
        }

        const normalizedNextName = nextName.toLowerCase();
        const hasDuplicate = tabs.some(
            tab =>
                tab.id !== renamingId &&
                canRenameTab(tab) &&
                tab.name.trim().toLowerCase() === normalizedNextName,
        );
        if (hasDuplicate) {
            toast.error('Tên tab đã tồn tại. Vui lòng đặt tên khác.');
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
            return;
        }

        onRename(renamingId, nextName);
        setRenamingId(null);
    }, [onRename, renameValue, renamingId, tabs, toast]);

    const handleTabKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenamingId(null);
        },
        [commitRename],
    );

    const closeOthers = (tabId: string) => {
        tabs.filter(t => t.id !== tabId).forEach(t => onClose(t.id));
    };

    const closeAll = () => {
        tabs.forEach(t => onClose(t.id));
    };

    return (
        <div className={TAB_STRIP_BAR_CLASS} data-tour='query-tabs' data-zone='tabStrip'>
            <div
                className='flex h-full items-stretch flex-1 gap-1 overflow-x-auto ui-scrollbar-hover transition-opacity p-1'
                ref={el => {
                    setDroppableRef(el);
                    (tabsScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                }}
            >
                <SortableContext
                    items={tabs.map(t => t.id)}
                    strategy={horizontalListSortingStrategy}
                >
                    {tabs.map(tab => (
                        <ContextMenu key={tab.id}>
                            <ContextMenuTrigger asChild>
                                <div>
                                    <SortableTabItem
                                        tab={tab}
                                        groupId={groupId}
                                        isActive={tab.id === activeTabId}
                                        renamingId={renamingId}
                                        renameValue={renameValue}
                                        renameInputRef={renameInputRef}
                                        onActivate={() => onActivate(tab.id)}
                                        onDoubleClick={() => startRename(tab)}
                                        activeTabRef={activeTabRef}
                                        onRenameChange={setRenameValue}
                                        onRenameBlur={commitRename}
                                        onRenameKeyDown={handleTabKeyDown}
                                        onClose={() => onClose(tab.id)}
                                    />
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className='min-w-[150px]'>
                                {canRenameTab(tab) && (
                                    <ContextMenuItem onSelect={() => startRename(tab)}>
                                        Rename
                                    </ContextMenuItem>
                                )}
                                {onSplit && (
                                    <ContextMenuItem
                                        className='gap-1.5'
                                        onSelect={() => onSplit(tab.id)}
                                    >
                                        <SplitSquareHorizontal size={11} />
                                        Split Right
                                    </ContextMenuItem>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem onSelect={() => onClose(tab.id)}>
                                    Close
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => closeOthers(tab.id)}>
                                    Close Others
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={closeAll}>Close All</ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    ))}
                </SortableContext>
            </div>

            <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-full w-9 shrink-0 rounded-none px-2.5 py-1.5 text-muted-foreground transition-colors duration-100 ui-interactive-surface'
                onClick={onNewTab}
                title={`New Tab (${newTabHint})`}
            >
                <Plus size={14} />
            </Button>
        </div>
    );
};
