// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Button, ContextMenu, ContextMenuTrigger } from '../../../components/ui';
import { interactiveSelectable, interactiveSelected } from '../../../components/ui/contract';
import { OBJECT_TYPE } from '../../../lib/constants';
import { getDriverCapabilities } from '../../../lib/driverCapabilities';
import {
    CATEGORY_KEY,
    type CategoryGroupNode,
    type ObjectLeafNode,
    type SchemaBucketNode,
} from '../databaseExplorerTypes';
import { renderDatabaseExplorerExtension, renderIcon } from './nodeRenderers';
import type { DropModalState, TruncateModalState } from './ConfirmMaintenanceDialogs';
import { ObjectNodeMenu } from './ObjectNodeMenu';

/**
 * Fixed row height for every row in the explorer list. A virtualizer positions
 * rows from this number, so the row wrappers below are the only place that
 * decides row geometry — if actual height and estimate diverge, the scrollbar
 * reports a length the content does not have.
 */
export const EXPLORER_ROW_HEIGHT = 28;

export interface ExplorerRowContext {
    driver: string;
    readOnlyMode: boolean;
    selectedObjectKey: string | null;
    onToggleSchema: (categoryKey: string, schemaName: string) => void;
    onCreateTable: (schemaName: string) => void;
    onSelectObject: (schemaName: string, objectName: string, categoryKey: string) => void;
    onOpenDefinition: (schemaName: string, objectName: string) => void;
    onOpenCatalog: (schemaName: string, objectName: string, categoryKey: string) => void;
    onRequestDrop: (state: DropModalState) => void;
    onRequestTruncate: (state: TruncateModalState) => void;
    onRefreshSchema: () => Promise<void>;
    onExportData: (schema: string, tableName: string) => void;
    onImportData: (schema: string, tableName: string) => void;
}

/** Per-list constants, computed once per render instead of once per row. */
export interface ExplorerListCapabilities {
    supportsDropCascade: boolean;
    supportsTruncate: boolean;
    supportsTruncateCascade: boolean;
    supportsTruncateRestartIdentity: boolean;
}

export function resolveListCapabilities(
    driver: string,
    objectType: CategoryGroupNode['dropObjectType'],
): ExplorerListCapabilities {
    const capabilities = getDriverCapabilities(driver);
    const isTableCategory = objectType === OBJECT_TYPE.TABLE;
    const isViewCategory = objectType === OBJECT_TYPE.VIEW;
    return {
        supportsDropCascade:
            capabilities.supportsDropCascade && (isTableCategory || isViewCategory),
        supportsTruncate: isTableCategory && capabilities.supportsTruncate,
        supportsTruncateCascade: isTableCategory && capabilities.supportsTruncateCascade,
        supportsTruncateRestartIdentity:
            isTableCategory && capabilities.supportsTruncateRestartIdentity,
    };
}

/** Roving-tabindex plumbing shared by every row kind (ExplorerList owns the index). */
export interface ExplorerRowFocusProps {
    tabIndex?: number;
    rowRef?: (el: HTMLDivElement | null) => void;
    onFocus?: () => void;
    onRowKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

interface ExplorerSchemaRowProps extends ExplorerRowContext, ExplorerRowFocusProps {
    bucket: SchemaBucketNode;
    category: CategoryGroupNode;
    expanded: boolean;
}

const ExplorerSchemaRowComponent: React.FC<ExplorerSchemaRowProps> = ({
    bucket,
    category,
    expanded,
    readOnlyMode,
    onToggleSchema,
    onCreateTable,
    tabIndex,
    rowRef,
    onFocus,
    onRowKeyDown,
}) => (
    <div
        ref={rowRef}
        data-object-key={`schema:${category.key}:${bucket.schemaName}`}
        data-explorer-focusable=''
        tabIndex={tabIndex ?? -1}
        onFocus={onFocus}
        onKeyDown={onRowKeyDown}
        className={cn(
            'group h-7 flex items-center gap-1 rounded-md! px-1.5 text-body! text-foreground transition-colors duration-fast cursor-pointer hover:bg-muted! ui-focus-ring',
            interactiveSelectable,
            // Pinned while this schema's objects scroll underneath it. Opaque:
            // object rows render behind it as they pass.
            expanded && 'sticky top-0 z-sticky bg-card border-b border-border/30',
        )}
        onClick={event => {
            event.stopPropagation();
            onToggleSchema(category.key, bucket.schemaName);
        }}
    >
        {expanded ? (
            <ChevronDown size={13} className='shrink-0' />
        ) : (
            <ChevronRight size={13} className='shrink-0' />
        )}
        {renderDatabaseExplorerExtension('schema', { bucket, category }) ?? (
            <>
                {renderIcon('schema')}
                <span className='flex-1 cursor-pointer truncate leading-5'>
                    {bucket.schemaName}
                </span>
            </>
        )}
        {category.allowCreateTable && (
            <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={event => {
                    event.stopPropagation();
                    if (!readOnlyMode) onCreateTable(bucket.schemaName);
                }}
                className='opacity-0 group-hover:opacity-100 cursor-pointer text-label! shrink-0 transition-opacity'
                title='New Table'
                disabled={readOnlyMode}
            >
                <Plus size={12} />
            </Button>
        )}
        <span className='shrink-0 text-label text-muted-foreground tabular-nums'>
            {bucket.totalCount}
        </span>
    </div>
);

export const ExplorerSchemaRow = React.memo(ExplorerSchemaRowComponent);

interface ExplorerObjectRowProps extends ExplorerRowContext, ExplorerRowFocusProps {
    item: ObjectLeafNode;
    category: CategoryGroupNode;
    capabilities: ExplorerListCapabilities;
}

const ExplorerObjectRowComponent: React.FC<ExplorerObjectRowProps> = ({
    item,
    category,
    readOnlyMode,
    selectedObjectKey,
    capabilities,
    onSelectObject,
    onOpenDefinition,
    onOpenCatalog,
    onRequestDrop,
    onRequestTruncate,
    onRefreshSchema,
    onExportData,
    onImportData,
    tabIndex,
    rowRef,
    onFocus,
    onRowKeyDown,
}) => {
    const objectKey = `${category.key}:${item.schemaName}.${item.name}`;
    const isSelected = selectedObjectKey === objectKey;
    const isTableCategory = category.dropObjectType === OBJECT_TYPE.TABLE;
    const canOpenContextMenu = Boolean(category.dropObjectType);

    const handleClick = useCallback(() => {
        onSelectObject(item.schemaName, item.name, category.key);
        if (
            category.key === CATEGORY_KEY.TABLES ||
            category.key === CATEGORY_KEY.VIEWS ||
            category.key === CATEGORY_KEY.MATERIALIZED_VIEWS
        ) {
            if (!category.canOpenDefinition) return;
            onOpenDefinition(item.schemaName, item.name);
            return;
        }
        onOpenCatalog(item.schemaName, item.name, category.key);
    }, [category, item.name, item.schemaName, onOpenCatalog, onOpenDefinition, onSelectObject]);

    const handleRequestDrop = useCallback(
        (itemName: string, cascade: boolean) => {
            if (!category.dropObjectType) return;
            onRequestDrop({
                schema: item.schemaName,
                item: itemName,
                type: category.dropObjectType,
                cascade,
            });
        },
        [category.dropObjectType, item.schemaName, onRequestDrop],
    );

    const handleRequestTruncate = useCallback(
        (tableName: string, cascade: boolean, restartIdentity: boolean) => {
            onRequestTruncate({
                schema: item.schemaName,
                tableName,
                cascade,
                restartIdentity,
            });
        },
        [item.schemaName, onRequestTruncate],
    );

    const handleExportData = useCallback(
        (itemName: string) => onExportData(item.schemaName, itemName),
        [item.schemaName, onExportData],
    );

    const handleImportData = useCallback(
        (itemName: string) => onImportData(item.schemaName, itemName),
        [item.schemaName, onImportData],
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild disabled={!canOpenContextMenu}>
                <div
                    ref={rowRef}
                    data-object-key={objectKey}
                    data-explorer-focusable=''
                    tabIndex={tabIndex ?? -1}
                    onFocus={onFocus}
                    onKeyDown={onRowKeyDown}
                    className={cn(
                        'group flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-small! text-foreground transition-colors duration-fast ui-focus-ring',
                        interactiveSelectable,
                        isSelected && interactiveSelected,
                        category.canOpenDefinition && 'cursor-pointer',
                    )}
                    onClick={handleClick}
                    title={item.name}
                >
                    <span className='w-[13px] mr-2 shrink-0 inline-block' />
                    {renderIcon(category.itemIcon, 12)}
                    <span className='flex-1 truncate leading-5'>{item.name}</span>
                </div>
            </ContextMenuTrigger>
            {canOpenContextMenu && (
                <ObjectNodeMenu
                    itemName={item.name}
                    readOnlyMode={readOnlyMode}
                    isTableCategory={isTableCategory}
                    supportsDropCascade={capabilities.supportsDropCascade}
                    supportsTruncate={capabilities.supportsTruncate}
                    supportsTruncateCascade={capabilities.supportsTruncateCascade}
                    supportsTruncateRestartIdentity={capabilities.supportsTruncateRestartIdentity}
                    onRequestDrop={handleRequestDrop}
                    onRequestTruncate={handleRequestTruncate}
                    onRefreshSchema={onRefreshSchema}
                    onExportData={handleExportData}
                    onImportData={handleImportData}
                />
            )}
        </ContextMenu>
    );
};

export const ExplorerObjectRow = React.memo(ExplorerObjectRowComponent);
