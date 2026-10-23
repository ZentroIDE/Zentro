// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { TAB_TYPE } from '../../../lib/constants';
import { parseTableTarget } from '../../../lib/tableTargets';
import { resolveDatabaseExplorerSelection } from '../databaseExplorerSelection';
import { catalogKindToCategoryKey } from '../catalogObjectKinds';
import { CATEGORY_KEY, type CategoryGroupNode } from '../databaseExplorerTypes';
import { ALL_SCHEMAS_VALUE } from './useExplorerDerivations';
import type { ExplorerUiState, ExplorerUiStateUpdater } from './explorerUiState';

function escapeObjectKeyForSelector(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface EditorSelectionSyncInput {
    categories: CategoryGroupNode[];
    activeCategoryKey: string;
    selectedSchema: string;
    showMoreCategories: boolean;
    updateExplorerUiState: ExplorerUiStateUpdater;
    isSchemaExpanded: (categoryKey: string, schemaName: string) => boolean;
    toggleSchema: (categoryKey: string, schemaName: string) => void;
    /**
     * Object key -> row position in the flattened, virtualized list. Rows
     * outside the viewport are not in the DOM, so revealing one has to go
     * through the virtualizer rather than query for its element.
     */
    rowIndexByObjectKey: Map<string, number>;
}

// Keeps the explorer selection in sync with the active editor tab (and vice
// versa): resolves the tab's table/catalog target to a tree node, reveals the
// node's category/schema, and scrolls it into the viewport.
export function useEditorSelectionSync({
    categories,
    activeCategoryKey,
    selectedSchema,
    showMoreCategories,
    updateExplorerUiState,
    isSchemaExpanded,
    toggleSchema,
    rowIndexByObjectKey,
}: EditorSelectionSyncInput) {
    const editorGroups = useEditorStore(state => state.groups);
    const editorActiveGroupId = useEditorStore(state => state.activeGroupId);

    const [selectedObjectKey, setSelectedObjectKey] = useState<string | null>(null);
    const selectionSourceRef = useRef<'editor' | 'tree' | null>(null);
    const lastSyncedEditorObjectKeyRef = useRef<string | null>(null);
    const objectListRef = useRef<HTMLDivElement>(null);
    const scrollSyncRafRef = useRef<number | null>(null);

    // The virtualizer's scroll-to-index, handed up by ExplorerList once it has
    // mounted. Kept in a ref so registering it does not re-run the selection
    // effects below, and paired with a flag so a selection made before the list
    // exists is replayed rather than dropped.
    const scrollToIndexRef = useRef<((index: number) => void) | null>(null);
    const pendingRevealRef = useRef<string | null>(null);

    const registerScrollToIndex = useCallback((scrollToIndex: (index: number) => void) => {
        scrollToIndexRef.current = scrollToIndex;
    }, []);

    const activeEditorTableTarget = useMemo(() => {
        const activeGroup = editorGroups.find(group => group.id === editorActiveGroupId);
        const activeTab = activeGroup?.tabs.find(tab => tab.id === activeGroup.activeTabId);
        if (!activeTab) return null;

        if (activeTab.type === TAB_TYPE.TABLE && activeTab.content) {
            const target = parseTableTarget(activeTab.content);
            if (target.isCreateDraft || !target.schema || !target.table) return null;
            return {
                schemaName: target.schema,
                objectName: target.table,
                categoryKey: CATEGORY_KEY.TABLES,
            };
        }

        if (activeTab.type === TAB_TYPE.CATALOG && activeTab.catalog) {
            const cat = activeTab.catalog;
            const categoryKey = catalogKindToCategoryKey(cat.objectKind);
            return {
                schemaName: cat.schema,
                objectName: cat.name,
                categoryKey,
            };
        }

        return null;
    }, [editorActiveGroupId, editorGroups]);

    /**
     * Reveals a row, preferring the virtualizer: a row outside the viewport is
     * not mounted, so the DOM query below cannot find it. The query stays as a
     * fallback for the window before ExplorerList has handed over its
     * scroll-to-index (and as a no-op safety net if the row is already mounted).
     */
    const ensureObjectVisibleInViewport = useCallback(
        (objectKey: string, attempt = 0) => {
            const root = objectListRef.current;
            if (!root) return;

            const rowIndex = rowIndexByObjectKey.get(objectKey);
            const scrollToIndex = scrollToIndexRef.current;
            if (rowIndex !== undefined && scrollToIndex) {
                scrollToIndex(rowIndex);
                return;
            }
            // The list has not registered yet; remember what to reveal and let
            // the registration effect below replay it.
            if (rowIndex !== undefined && !scrollToIndex) {
                pendingRevealRef.current = objectKey;
                return;
            }

            const escapedKey = escapeObjectKeyForSelector(objectKey);
            const selectedNode = root.querySelector<HTMLElement>(
                `[data-object-key="${escapedKey}"]`,
            );
            if (selectedNode) {
                selectedNode.scrollIntoView({ block: 'center', inline: 'nearest' });
                return;
            }

            if (attempt >= 8) return;
            scrollSyncRafRef.current = window.requestAnimationFrame(() => {
                ensureObjectVisibleInViewport(objectKey, attempt + 1);
            });
        },
        [rowIndexByObjectKey],
    );

    // Replay a reveal that was requested before the list mounted its virtualizer.
    useEffect(() => {
        const pending = pendingRevealRef.current;
        if (!pending) return;
        pendingRevealRef.current = null;
        ensureObjectVisibleInViewport(pending);
    }, [ensureObjectVisibleInViewport, rowIndexByObjectKey]);

    useEffect(() => {
        if (!activeEditorTableTarget) {
            lastSyncedEditorObjectKeyRef.current = null;
            selectionSourceRef.current = 'editor';
            setSelectedObjectKey(null);
            return;
        }

        const selected = resolveDatabaseExplorerSelection(
            categories,
            activeEditorTableTarget.schemaName,
            activeEditorTableTarget.objectName,
            activeEditorTableTarget.categoryKey,
        );

        if (!selected) {
            lastSyncedEditorObjectKeyRef.current = null;
            selectionSourceRef.current = 'editor';
            setSelectedObjectKey(null);
            return;
        }

        const targetChanged = lastSyncedEditorObjectKeyRef.current !== selected.selectedObjectKey;
        const updates: Partial<ExplorerUiState> = {};
        if (targetChanged && activeCategoryKey !== selected.categoryKey) {
            updates.activeCategoryKey = selected.categoryKey;
        }
        if (targetChanged && !selected.isPrimaryCategory && !showMoreCategories) {
            updates.showMoreCategories = true;
        }
        if (
            targetChanged &&
            selectedSchema !== ALL_SCHEMAS_VALUE &&
            selectedSchema !== selected.schemaName
        ) {
            updates.selectedSchema = selected.schemaName;
        }
        if (Object.keys(updates).length > 0) {
            updateExplorerUiState(updates);
        }

        if (targetChanged && !isSchemaExpanded(selected.categoryKey, selected.schemaName)) {
            toggleSchema(selected.categoryKey, selected.schemaName);
        }

        lastSyncedEditorObjectKeyRef.current = selected.selectedObjectKey;
        selectionSourceRef.current = 'editor';
        setSelectedObjectKey(selected.selectedObjectKey);
    }, [
        activeCategoryKey,
        activeEditorTableTarget,
        categories,
        isSchemaExpanded,
        selectedSchema,
        showMoreCategories,
        toggleSchema,
        updateExplorerUiState,
    ]);

    useEffect(() => {
        if (scrollSyncRafRef.current !== null) {
            window.cancelAnimationFrame(scrollSyncRafRef.current);
            scrollSyncRafRef.current = null;
        }
        if (!selectedObjectKey) return;

        ensureObjectVisibleInViewport(selectedObjectKey);
        selectionSourceRef.current = null;
    }, [
        ensureObjectVisibleInViewport,
        selectedObjectKey,
        activeCategoryKey,
        selectedSchema,
        showMoreCategories,
        categories,
    ]);

    useEffect(
        () => () => {
            if (scrollSyncRafRef.current !== null) {
                window.cancelAnimationFrame(scrollSyncRafRef.current);
                scrollSyncRafRef.current = null;
            }
        },
        [],
    );

    const handleSelectObject = useCallback(
        (schemaName: string, objectName: string, categoryKey: string) => {
            selectionSourceRef.current = 'tree';
            setSelectedObjectKey(`${categoryKey}:${schemaName}.${objectName}`);
        },
        [],
    );

    return {
        selectedObjectKey,
        handleSelectObject,
        objectListRef,
        registerScrollToIndex,
    };
}
