// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from '../../../components/ui';

interface ObjectNodeMenuProps {
    itemName: string;
    readOnlyMode: boolean;
    isTableCategory: boolean;
    supportsDropCascade: boolean;
    supportsTruncate: boolean;
    supportsTruncateCascade: boolean;
    supportsTruncateRestartIdentity: boolean;
    onRequestDrop: (itemName: string, cascade: boolean) => void;
    onRequestTruncate: (tableName: string, cascade: boolean, restartIdentity: boolean) => void;
    onRefreshSchema: () => Promise<void>;
    onExportData: (itemName: string) => void;
    onImportData: (itemName: string) => void;
}

// Context menu for one object row in the explorer tree.
export const ObjectNodeMenu: React.FC<ObjectNodeMenuProps> = ({
    itemName,
    readOnlyMode,
    isTableCategory,
    supportsDropCascade,
    supportsTruncate,
    supportsTruncateCascade,
    supportsTruncateRestartIdentity,
    onRequestDrop,
    onRequestTruncate,
    onRefreshSchema,
    onExportData,
    onImportData,
}) => (
    <ContextMenuContent className='min-w-[220px]'>
        <ContextMenuItem
            onSelect={(event: Event) => {
                event.preventDefault();
                void onRefreshSchema();
            }}
        >
            <RefreshCw size={14} />
            Refresh...
        </ContextMenuItem>

        <ContextMenuItem
            onSelect={(event: Event) => event.preventDefault()}
            title='Coming soon'
            className='cursor-not-allowed opacity-50'
        >
            Restore...
        </ContextMenuItem>
        <ContextMenuItem
            onSelect={(event: Event) => event.preventDefault()}
            title='Coming soon'
            className='cursor-not-allowed opacity-50'
        >
            Backup...
        </ContextMenuItem>

        <ContextMenuSub>
            <ContextMenuSubTrigger>Import/Export Data...</ContextMenuSubTrigger>
            <ContextMenuSubContent className='min-w-[200px]'>
                <ContextMenuItem
                    onSelect={() => {
                        if (!isTableCategory) return;
                        onImportData(itemName);
                    }}
                    disabled={!isTableCategory}
                >
                    Import...
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={() => {
                        // Unlike Drop/Truncate (which open a modal whose own
                        // focus-trap incidentally closes this menu), Export
                        // just opens a new tab in the background — nothing
                        // else ever steals focus to dismiss the menu. Don't
                        // preventDefault here so Radix closes it on select,
                        // like it would with no handler at all.
                        if (!isTableCategory) return;
                        onExportData(itemName);
                    }}
                    disabled={!isTableCategory}
                >
                    Export...
                </ContextMenuItem>
            </ContextMenuSubContent>
        </ContextMenuSub>

        {supportsTruncate && (
            <ContextMenuSub>
                <ContextMenuSubTrigger danger disabled={readOnlyMode}>
                    Truncate
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className='min-w-[200px]'>
                    <ContextMenuItem
                        onSelect={(event: Event) => {
                            event.preventDefault();
                            onRequestTruncate(itemName, false, false);
                        }}
                        danger
                        disabled={readOnlyMode}
                    >
                        Truncate
                    </ContextMenuItem>
                    {supportsTruncateCascade && (
                        <ContextMenuItem
                            onSelect={(event: Event) => {
                                event.preventDefault();
                                onRequestTruncate(itemName, true, false);
                            }}
                            danger
                            disabled={readOnlyMode}
                        >
                            Truncate Cascade
                        </ContextMenuItem>
                    )}
                    {supportsTruncateRestartIdentity && (
                        <ContextMenuItem
                            onSelect={(event: Event) => {
                                event.preventDefault();
                                onRequestTruncate(itemName, false, true);
                            }}
                            danger
                            disabled={readOnlyMode}
                        >
                            Truncate Restart Identity
                        </ContextMenuItem>
                    )}
                </ContextMenuSubContent>
            </ContextMenuSub>
        )}
        <ContextMenuSeparator />

        <ContextMenuItem
            onSelect={(event: Event) => {
                event.preventDefault();
                if (readOnlyMode) return;
                onRequestDrop(itemName, false);
            }}
            danger
            disabled={readOnlyMode}
        >
            <Trash2 size={14} />
            Drop
        </ContextMenuItem>
        {supportsDropCascade && (
            <ContextMenuItem
                onSelect={(event: Event) => {
                    event.preventDefault();
                    if (readOnlyMode) return;
                    onRequestDrop(itemName, true);
                }}
                danger
                disabled={readOnlyMode}
            >
                <Trash2 size={14} />
                Drop (Cascade)
            </ContextMenuItem>
        )}
    </ContextMenuContent>
);
