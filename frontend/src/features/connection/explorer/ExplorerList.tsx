// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDeleteRelationships } from '../../../hooks/useDeleteRelationships';
import { OBJECT_TYPE, type DroppableObjectType } from '../../../lib/constants';
import { useConnectionStore } from '../../../stores/connectionStore';
import type { CategoryGroupNode } from '../databaseExplorerTypes';
import {
    ConfirmMaintenanceDialogs,
    type DropModalState,
    type TruncateModalState,
} from './ConfirmMaintenanceDialogs';
import {
    EXPLORER_ROW_HEIGHT,
    ExplorerObjectRow,
    ExplorerSchemaRow,
    resolveListCapabilities,
    type ExplorerRowContext,
} from './ExplorerRow';
import { buildExplorerRows } from './explorerRows';

/** Rows mounted outside the viewport, to cover a flick before React renders. */
const OVERSCAN_ROWS = 8;

/**
 * Everything a row needs except the drop/truncate requests: those are raised by
 * the rows but owned here, because the confirmation dialogs sit at list level
 * rather than once per row.
 */
type ExplorerListRowContext = Omit<ExplorerRowContext, 'onRequestDrop' | 'onRequestTruncate'>;

interface ExplorerListProps extends ExplorerListRowContext {
    category: CategoryGroupNode | null;
    isSchemaExpanded: (categoryKey: string, schemaName: string) => boolean;
    isFiltering: boolean;
    /** Scroll host, owned by the selection sync so it can reveal a row. */
    scrollRef: React.RefObject<HTMLDivElement | null>;
    /** Receives the virtualizer's scroll-to-index so off-screen rows stay reachable. */
    onScrollToIndexReady?: (scrollToIndex: (index: number) => void) => void;
    emptyMessage: string;
    onDropObject: (
        schema: string,
        objectName: string,
        objectType: DroppableObjectType,
        cascade: boolean,
    ) => Promise<void>;
    onTruncateTable: (
        schema: string,
        tableName: string,
        cascade: boolean,
        restartIdentity: boolean,
    ) => Promise<void>;
    /** Arrow Up from the first row returns focus to the category list. */
    onExitUp?: () => void;
    /** Lets the category list move focus into a tree row. */
    focusRowRef?: React.MutableRefObject<((index: number) => void) | null>;
}

/**
 * Renders the active category as a single virtualized list of rows.
 *
 * Previously each schema bucket rendered all of its objects when expanded, and
 * filtering expands every schema (see useDatabaseExplorerModel), so a filter
 * change could mount tens of thousands of rows at ~0.8ms each. Only the rows in
 * view are mounted now, which keeps a keystroke's cost proportional to the
 * viewport rather than to the catalog.
 */
export const ExplorerList: React.FC<ExplorerListProps> = ({
    category,
    isSchemaExpanded,
    isFiltering,
    scrollRef,
    onScrollToIndexReady,
    emptyMessage,
    driver,
    readOnlyMode,
    selectedObjectKey,
    onToggleSchema,
    onCreateTable,
    onSelectObject,
    onOpenDefinition,
    onOpenCatalog,
    onDropObject,
    onTruncateTable,
    onRefreshSchema,
    onExportData,
    onImportData,
    onExitUp,
    focusRowRef,
}) => {
    const [dropModal, setDropModal] = useState<DropModalState | null>(null);
    const [truncateModal, setTruncateModal] = useState<TruncateModalState | null>(null);

    // Only a table can be referenced by foreign keys; views have nothing to warn about.
    const connectionID = useConnectionStore(s => s.activeProfile?.id ?? '');
    const dbName = useConnectionStore(s => s.activeProfile?.db_name ?? '');
    const dropTarget = useMemo(
        () =>
            dropModal?.type === OBJECT_TYPE.TABLE
                ? { connectionID, dbName, schema: dropModal.schema, table: dropModal.item }
                : null,
        [connectionID, dbName, dropModal],
    );
    const truncateTarget = useMemo(
        () =>
            truncateModal
                ? {
                      connectionID,
                      dbName,
                      schema: truncateModal.schema,
                      table: truncateModal.tableName,
                  }
                : null,
        [connectionID, dbName, truncateModal],
    );
    const dropRelationships = useDeleteRelationships(dropTarget);
    const truncateRelationships = useDeleteRelationships(truncateTarget);

    const rows = useMemo(
        () => buildExplorerRows(category, isSchemaExpanded, isFiltering),
        [category, isFiltering, isSchemaExpanded],
    );
    // While a filter is showing hits, the tab stop is the first object — the
    // schema header above it is a group, not the result. The signature only
    // changes when that hit list changes, so arrowing through the rows is
    // not pulled back to the top.
    const filterResultSignature =
        isFiltering && rows.length > 0
            ? `${rows.length}:${rows.find(row => row.kind === 'object')?.key ?? rows[0].key}`
            : '';
    const filterResultIndexRef = useRef<number | null>(null);
    filterResultIndexRef.current = (() => {
        if (!filterResultSignature) return null;
        const objectIndex = rows.findIndex(row => row.kind === 'object');
        return objectIndex === -1 ? 0 : objectIndex;
    })();
    const capabilities = useMemo(
        () => resolveListCapabilities(driver, category?.dropObjectType ?? null),
        [category?.dropObjectType, driver],
    );

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => EXPLORER_ROW_HEIGHT,
        overscan: OVERSCAN_ROWS,
    });

    // Hand the virtualizer's scroll-to-index up once. Held in a ref so the
    // identifying callback stays out of the render path.
    const scrollToIndexRef = useRef(virtualizer.scrollToIndex);
    scrollToIndexRef.current = virtualizer.scrollToIndex;
    useEffect(() => {
        onScrollToIndexReady?.(index => scrollToIndexRef.current(index, { align: 'center' }));
    }, [onScrollToIndexReady]);

    // One context object for the whole list: building it per row would change
    // every row's props on every render and defeat their memoization.
    const rowContext: ExplorerRowContext = useMemo(
        () => ({
            driver,
            readOnlyMode,
            selectedObjectKey,
            onToggleSchema,
            onCreateTable,
            onSelectObject,
            onOpenDefinition,
            onOpenCatalog,
            onRequestDrop: setDropModal,
            onRequestTruncate: setTruncateModal,
            onRefreshSchema,
            onExportData,
            onImportData,
        }),
        [
            driver,
            onCreateTable,
            onExportData,
            onImportData,
            onOpenCatalog,
            onOpenDefinition,
            onRefreshSchema,
            onSelectObject,
            onToggleSchema,
            readOnlyMode,
            selectedObjectKey,
        ],
    );

    const confirmDrop = useCallback(async () => {
        if (!dropModal) return;
        await onDropObject(dropModal.schema, dropModal.item, dropModal.type, dropModal.cascade);
        setDropModal(null);
    }, [dropModal, onDropObject]);

    const confirmTruncate = useCallback(async () => {
        if (!truncateModal) return;
        await onTruncateTable(
            truncateModal.schema,
            truncateModal.tableName,
            truncateModal.cascade,
            truncateModal.restartIdentity,
        );
        setTruncateModal(null);
    }, [onTruncateTable, truncateModal]);

    const virtualItems = virtualizer.getVirtualItems();

    // ── Roving tabindex (Z4, deferred-stretch keyboard tree nav) ──────────
    // Only one row is ever tabbable at a time (tabIndex=0); the rest are -1.
    // Arrow Up/Down move it (and scroll it into view via the virtualizer,
    // since off-screen rows aren't mounted); Arrow Right/Left expand/collapse
    // a schema row; Enter/Space activates the row the same way a click would.
    const [focusedRowIndex, setFocusedRowIndex] = useState(0);
    // One tab stop, always, whenever any row is on screen. If the remembered
    // row is not mounted, the first mounted row holds tabindex 0 until focus
    // moves — otherwise the result list drops out of the tab order.
    const focusedRowMounted = virtualItems.some(item => item.index === focusedRowIndex);
    const tabStopIndex = focusedRowMounted
        ? focusedRowIndex
        : (virtualItems[0]?.index ?? focusedRowIndex);
    const rowElementsRef = useRef(new Map<number, HTMLDivElement>());
    const pendingFocusIndexRef = useRef<number | null>(null);

    useEffect(() => {
        if (focusedRowIndex >= rows.length) {
            setFocusedRowIndex(Math.max(0, rows.length - 1));
        }
    }, [focusedRowIndex, rows.length]);

    useEffect(() => {
        const index = filterResultIndexRef.current;
        if (index === null) return;
        setFocusedRowIndex(current => (current === index ? current : index));
        // Mount the row. A virtualized list with the tab stop off-screen has
        // no tabindex=0 at all, so Tab from the filter would skip the results.
        scrollToIndexRef.current(index, { align: 'auto' });
    }, [filterResultSignature]);

    const focusRowByIndex = useCallback((index: number) => {
        const el = rowElementsRef.current.get(index);
        if (el) {
            el.focus();
            pendingFocusIndexRef.current = null;
        } else {
            // Row isn't mounted yet (virtualizer just scrolled it into view) —
            // retry once more frames have had a chance to render it.
            pendingFocusIndexRef.current = index;
            requestAnimationFrame(() => {
                if (pendingFocusIndexRef.current !== index) return;
                rowElementsRef.current.get(index)?.focus();
                pendingFocusIndexRef.current = null;
            });
        }
    }, []);

    const moveFocus = useCallback(
        (nextIndex: number) => {
            const clamped = Math.max(0, Math.min(rows.length - 1, nextIndex));
            setFocusedRowIndex(clamped);
            virtualizer.scrollToIndex(clamped, { align: 'auto' });
            focusRowByIndex(clamped);
        },
        [focusRowByIndex, rows.length, virtualizer],
    );

    useEffect(() => {
        if (!focusRowRef) return;
        focusRowRef.current = moveFocus;
        return () => {
            focusRowRef.current = null;
        };
    }, [focusRowRef, moveFocus]);

    const activateRow = useCallback(
        (index: number) => {
            const row = rows[index];
            if (!row) return;
            if (row.kind === 'schema') {
                onToggleSchema(category?.key ?? '', row.bucket.schemaName);
                return;
            }
            if (row.kind === 'object') {
                onSelectObject(row.item.schemaName, row.item.name, row.category.key);
            }
        },
        [category?.key, onSelectObject, onToggleSchema, rows],
    );

    const handleRowKeyDown = useCallback(
        (index: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    moveFocus(index + 1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    if (index === 0 && onExitUp) onExitUp();
                    else moveFocus(index - 1);
                    break;
                case 'ArrowRight': {
                    const row = rows[index];
                    if (row?.kind === 'schema' && !row.expanded) {
                        event.preventDefault();
                        onToggleSchema(category?.key ?? '', row.bucket.schemaName);
                    }
                    break;
                }
                case 'ArrowLeft': {
                    const row = rows[index];
                    if (row?.kind === 'schema' && row.expanded) {
                        event.preventDefault();
                        onToggleSchema(category?.key ?? '', row.bucket.schemaName);
                    }
                    break;
                }
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    activateRow(index);
                    break;
                default:
                    break;
            }
        },
        [activateRow, category?.key, moveFocus, onExitUp, onToggleSchema, rows],
    );

    return (
        <>
            <ConfirmMaintenanceDialogs
                dropModal={dropModal}
                truncateModal={truncateModal}
                onCloseDrop={() => setDropModal(null)}
                onCloseTruncate={() => setTruncateModal(null)}
                onConfirmDrop={() => void confirmDrop()}
                onConfirmTruncate={() => void confirmTruncate()}
                dropRelationships={dropRelationships}
                truncateRelationships={truncateRelationships}
            />

            {rows.length === 0 ? (
                <div className='flex items-center gap-1.5 rounded-md px-1.5 py-1 text-body! text-muted-foreground'>
                    {emptyMessage}
                </div>
            ) : (
                <div
                    style={{
                        height: virtualizer.getTotalSize(),
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {virtualItems.map(virtualRow => {
                        const row = rows[virtualRow.index];
                        if (!row) return null;
                        const index = virtualRow.index;
                        const focusProps = {
                            tabIndex: index === tabStopIndex ? 0 : -1,
                            rowRef: (el: HTMLDivElement | null) => {
                                if (el) rowElementsRef.current.set(index, el);
                                else rowElementsRef.current.delete(index);
                            },
                            onFocus: () => setFocusedRowIndex(index),
                            onRowKeyDown: handleRowKeyDown(index),
                        };
                        return (
                            <div
                                key={row.key}
                                data-explorer-row=''
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: EXPLORER_ROW_HEIGHT,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                {row.kind === 'schema' && category ? (
                                    <ExplorerSchemaRow
                                        {...rowContext}
                                        {...focusProps}
                                        bucket={row.bucket}
                                        category={category}
                                        expanded={row.expanded}
                                    />
                                ) : row.kind === 'object' ? (
                                    <ExplorerObjectRow
                                        {...rowContext}
                                        {...focusProps}
                                        item={row.item}
                                        category={row.category}
                                        capabilities={capabilities}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};
