// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
    menuItemCompactClass,
} from '../../../components/ui';
import type {
    ResultContextColumnBlurAction,
    ResultContextColumnVisibilityAction,
    ResultContextCopyAsAction,
    ResultContextMenuPayload,
    ResultContextPasteAction,
    ResultContextWhereAction,
} from './types';

const LAST_USED_COPY_AS_KEY = 'zentro.result.copyAs.lastAction';

interface ResultContextMenuProps {
    contextMenu: ResultContextMenuPayload | null;
    contextMenuRef: React.RefObject<HTMLDivElement>;
    contextMenuPosition: {
        left: number;
        top: number;
        submenuOpensLeft?: boolean;
    } | null;
    canCopy: boolean;
    canPaste: boolean;
    canDiscardChanges: boolean;
    canDuplicateRows: boolean;
    canSetNull: boolean;
    canDeleteRows: boolean;
    canOpenRowInNewQueryTab: boolean;
    canUndoLastContextAction: boolean;
    copyDisabledTitle: string;
    pasteDisabledTitle: string;
    discardChangesDisabledTitle: string;
    duplicateDisabledTitle: string;
    setNullDisabledTitle: string;
    deleteDisabledTitle: string;
    openRowQueryDisabledTitle: string;
    undoDisabledTitle: string;
    pasteActions: ResultContextPasteAction[];
    copyAsActions: ResultContextCopyAsAction[];
    whereActions: ResultContextWhereAction[];
    columnBlurAction?: ResultContextColumnBlurAction | null;
    columnVisibilityActions: ResultContextColumnVisibilityAction[];
    onCopy: () => void;
    onPaste: () => void;
    onDiscardChanges: () => void;
    onDeleteRow: () => void;
    onDuplicateRow: () => void;
    onSetNull: () => void;
    onOpenRowInNewQueryTab: () => void;
    onUndoLastContextAction: () => void;
}

export const ResultContextMenu: React.FC<ResultContextMenuProps> = ({
    contextMenu,
    contextMenuRef,
    contextMenuPosition,
    canCopy,
    canPaste,
    canDiscardChanges,
    canDuplicateRows,
    canSetNull,
    canDeleteRows,
    canOpenRowInNewQueryTab,
    canUndoLastContextAction,
    copyDisabledTitle,
    pasteDisabledTitle,
    discardChangesDisabledTitle,
    duplicateDisabledTitle,
    setNullDisabledTitle,
    deleteDisabledTitle,
    openRowQueryDisabledTitle,
    undoDisabledTitle,
    pasteActions,
    copyAsActions,
    whereActions,
    columnBlurAction,
    columnVisibilityActions,
    onCopy,
    onPaste,
    onDiscardChanges,
    onDeleteRow,
    onDuplicateRow,
    onSetNull,
    onOpenRowInNewQueryTab,
    onUndoLastContextAction,
}) => {
    const [lastUsedCopyAs, setLastUsedCopyAs] = React.useState<string>('');
    const triggerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        try {
            const saved = window.localStorage.getItem(LAST_USED_COPY_AS_KEY) || '';
            setLastUsedCopyAs(saved);
        } catch {
            setLastUsedCopyAs('');
        }
    }, []);

    const runCopyAs = React.useCallback((action: ResultContextCopyAsAction) => {
        if (action.disabled) return;
        action.onSelect();
        try {
            window.localStorage.setItem(LAST_USED_COPY_AS_KEY, action.id);
        } catch {
            // ignore localStorage failures
        }
        setLastUsedCopyAs(action.id);
    }, []);

    const whereAction = whereActions[0] ?? null;

    React.useEffect(() => {
        if (!contextMenu || !contextMenuPosition) return;
        const trigger = triggerRef.current;
        if (!trigger) return;
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: contextMenuPosition.left,
            clientY: contextMenuPosition.top,
        });
        trigger.dispatchEvent(event);
    }, [contextMenu, contextMenuPosition]);

    if (!contextMenu || !contextMenuPosition) return null;

    return (
        <div
            className='fixed z-panel-overlay pointer-events-none'
            style={{ left: contextMenuPosition.left, top: contextMenuPosition.top }}
        >
            <ContextMenu modal={false}>
                <ContextMenuTrigger asChild>
                    <div ref={triggerRef} className='h-px w-px' />
                </ContextMenuTrigger>
                <ContextMenuContent
                    ref={contextMenuRef}
                    className='w-56 pointer-events-auto'
                    onCloseAutoFocus={(event: Event) => event.preventDefault()}
                >
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={pasteDisabledTitle}
                        disabled={!canPaste}
                        onSelect={onPaste}
                    >
                        Paste
                        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                    </ContextMenuItem>
                    {pasteActions.length > 0 && (
                        <ContextMenuSub>
                            <ContextMenuSubTrigger
                                className={menuItemCompactClass}
                                title='Choose paste behavior'
                                disabled={!canPaste}
                            >
                                Paste Special
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className='w-56'>
                                {pasteActions.map(action => (
                                    <ContextMenuItem
                                        key={action.id}
                                        className={menuItemCompactClass}
                                        title={action.title}
                                        disabled={action.disabled}
                                        onSelect={action.onSelect}
                                    >
                                        {action.label}
                                    </ContextMenuItem>
                                ))}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    )}
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={copyDisabledTitle}
                        disabled={!canCopy}
                        onSelect={onCopy}
                    >
                        Copy
                        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuSub>
                        <ContextMenuSubTrigger
                            className={menuItemCompactClass}
                            title='Choose copy format'
                            disabled={!canCopy}
                        >
                            Copy as
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className='w-56'>
                            {copyAsActions.map(action => (
                                <ContextMenuItem
                                    key={action.id}
                                    className={menuItemCompactClass}
                                    title={action.title}
                                    disabled={action.disabled}
                                    onSelect={() => runCopyAs(action)}
                                >
                                    <span>{action.label}</span>
                                    <span className='ml-auto text-label text-muted-foreground'>
                                        {action.id === lastUsedCopyAs ? 'Last used' : ''}
                                    </span>
                                </ContextMenuItem>
                            ))}
                        </ContextMenuSubContent>
                    </ContextMenuSub>

                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={whereAction?.title ?? 'Generate WHERE IN from selected values'}
                        disabled={!whereAction || whereAction.disabled}
                        onSelect={() => whereAction?.onSelect?.()}
                    >
                        Generate WHERE (IN)
                    </ContextMenuItem>
                    {columnBlurAction && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                                className={menuItemCompactClass}
                                title={columnBlurAction.title}
                                disabled={columnBlurAction.disabled}
                                onSelect={columnBlurAction.onSelect}
                            >
                                {columnBlurAction.label}
                            </ContextMenuItem>
                        </>
                    )}
                    {columnVisibilityActions.length > 0 && (
                        <ContextMenuSub>
                            <ContextMenuSubTrigger
                                className={menuItemCompactClass}
                                title='Column visibility actions'
                            >
                                Columns
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className='w-56'>
                                {columnVisibilityActions.map(action => (
                                    <ContextMenuItem
                                        key={action.id}
                                        className={menuItemCompactClass}
                                        title={action.title}
                                        disabled={action.disabled}
                                        onSelect={action.onSelect}
                                    >
                                        {action.label}
                                    </ContextMenuItem>
                                ))}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    )}
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={openRowQueryDisabledTitle}
                        disabled={!canOpenRowInNewQueryTab}
                        onSelect={onOpenRowInNewQueryTab}
                    >
                        Open Row in New Query Tab
                    </ContextMenuItem>
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={discardChangesDisabledTitle}
                        disabled={!canDiscardChanges}
                        onSelect={onDiscardChanges}
                    >
                        Discard changes
                    </ContextMenuItem>
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={duplicateDisabledTitle}
                        disabled={!canDuplicateRows}
                        onSelect={onDuplicateRow}
                    >
                        Duplicate Row
                    </ContextMenuItem>
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={setNullDisabledTitle}
                        disabled={!canSetNull}
                        onSelect={onSetNull}
                    >
                        Set NULL
                    </ContextMenuItem>
                    <ContextMenuItem
                        title={deleteDisabledTitle}
                        disabled={!canDeleteRows}
                        danger
                        className={menuItemCompactClass}
                        onSelect={onDeleteRow}
                    >
                        Delete Row
                        <ContextMenuShortcut>Del</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                        className={menuItemCompactClass}
                        title={undoDisabledTitle}
                        disabled={!canUndoLastContextAction}
                        onSelect={onUndoLastContextAction}
                    >
                        Undo Last Context Action
                        <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </div>
    );
};
