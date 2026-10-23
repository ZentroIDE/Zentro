// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { cn } from '../../lib/cn';
import { useDatabaseExplorerModel } from './useDatabaseExplorerModel';
import { useSidebarPanelState } from '../../stores/sidebarUiStore';
import { EXPLORER_PANEL_STATE_DEFAULT } from '../../components/sidebar/sidebarPanelStateDefaults';
import { ExplorerList } from './explorer/ExplorerList';
import { buildExplorerRowIndex, buildExplorerRows } from './explorer/explorerRows';
import { ExplorerToolbar } from './explorer/ExplorerToolbar';
import { CategoryList } from './explorer/CategoryList';
import { ALL_SCHEMAS_VALUE, useExplorerDerivations } from './explorer/useExplorerDerivations';
import { useEditorSelectionSync } from './explorer/useEditorSelectionSync';
import { useExplorerActions } from './explorer/useExplorerActions';
import type { ExplorerUiState } from './explorer/explorerUiState';
import { CATEGORY_KEY } from './databaseExplorerTypes';

// Composition root of the explorer: wires the model, ui-state, derivations,
// editor-selection sync, and actions together. Rendering lives in the
// explorer/ modules; node visuals dispatch through explorer/nodeRenderers.
export const DatabaseExplorer: React.FC = () => {
    const { isConnected, activeProfile } = useConnectionStore();

    if (!isConnected || !activeProfile || !activeProfile.db_name || !activeProfile.name) {
        return null;
    }

    return (
        <ConnectedDatabaseExplorer
            profileName={activeProfile.name}
            connectionID={activeProfile.id || ''}
            dbName={activeProfile.db_name}
            driver={activeProfile.driver || ''}
        />
    );
};

interface ConnectedDatabaseExplorerProps {
    /** Active profile's display name — used only as a local schema-tree
     * cache key (see useDatabaseExplorerModel), not as an identity sent to
     * a pinned-connection call. */
    profileName: string;
    /** Active profile's pool ID — the identity write/pinned-connection
     * calls need (see useExplorerActions). */
    connectionID: string;
    dbName: string;
    driver: string;
}

const ConnectedDatabaseExplorer: React.FC<ConnectedDatabaseExplorerProps> = ({
    profileName,
    connectionID,
    dbName,
    driver,
}) => {
    const viewMode = useSettingsStore(state => state.viewMode);
    const [explorerUiState, setExplorerUiState] = useSidebarPanelState(
        'primary',
        'explorer',
        EXPLORER_PANEL_STATE_DEFAULT,
    );
    const { filter, fuzzyMatch, activeCategoryKey, selectedSchema, showMoreCategories } =
        explorerUiState;
    const filterInputRef = useRef<HTMLInputElement>(null);
    const focusTreeRowRef = useRef<((index: number) => void) | null>(null);
    const focusCategoryRef = useRef<(() => void) | null>(null);
    const schemaTreeKey = `${profileName}:${dbName}`;
    const schemas = useSchemaStore(state => state.trees[schemaTreeKey]);
    const schemaNames = useMemo(() => (schemas ?? []).map(schema => schema.Name), [schemas]);

    const updateExplorerUiState = useCallback(
        (next: Partial<ExplorerUiState>) => {
            setExplorerUiState(current => ({
                ...current,
                ...next,
            }));
        },
        [setExplorerUiState],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key.toLowerCase() === 'f') {
                const activeEl = document.activeElement;
                if (activeEl?.closest('.sidebar')) {
                    event.preventDefault();
                    filterInputRef.current?.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        updateExplorerUiState({ selectedSchema: ALL_SCHEMAS_VALUE });
    }, [schemaTreeKey, updateExplorerUiState]);

    const { categories, isLoading, hasLoadedSchemas, isFiltering, isSchemaExpanded, toggleSchema } =
        useDatabaseExplorerModel({
            profileName,
            dbName,
            driver,
            filter,
            fuzzyMatch,
        });

    const {
        availableSchemas,
        scopedCategories,
        secondaryCategories,
        visibleCategories,
        activeCategory,
    } = useExplorerDerivations({
        categories,
        selectedSchema,
        activeCategoryKey,
        showMoreCategories,
        schemaNames,
    });

    // The rendered list is flat so it can be virtualized, which also makes it
    // the map selection uses to scroll to a row that is not mounted.
    const explorerRows = React.useMemo(
        () => buildExplorerRows(activeCategory, isSchemaExpanded, isFiltering),
        [activeCategory, isFiltering, isSchemaExpanded],
    );
    const rowIndexByObjectKey = React.useMemo(
        () => buildExplorerRowIndex(explorerRows),
        [explorerRows],
    );

    const { selectedObjectKey, handleSelectObject, objectListRef, registerScrollToIndex } =
        useEditorSelectionSync({
            categories,
            activeCategoryKey,
            selectedSchema,
            showMoreCategories,
            updateExplorerUiState,
            isSchemaExpanded,
            toggleSchema,
            rowIndexByObjectKey,
        });

    const {
        handleOpenDefinition,
        handleOpenCatalog,
        handleCreateTable,
        handleDropObject,
        handleTruncateTable,
        handleRefreshSchema,
        handleExportData,
        handleImportData,
        writeSafetyModals,
    } = useExplorerActions({ connectionID, dbName, driver });

    useEffect(() => {
        if (scopedCategories.length === 0) return;
        const hasActive = scopedCategories.some(category => category.key === activeCategoryKey);
        if (!hasActive) {
            const tablesCategory = scopedCategories.find(
                category => category.key === CATEGORY_KEY.TABLES,
            );
            updateExplorerUiState({
                activeCategoryKey: (tablesCategory || scopedCategories[0]).key,
            });
        }
    }, [activeCategoryKey, scopedCategories, updateExplorerUiState]);
    useEffect(() => {
        if (visibleCategories.length === 0) return;
        const hasVisibleActive = visibleCategories.some(
            category => category.key === activeCategoryKey,
        );
        if (!hasVisibleActive) {
            const tablesCategory = visibleCategories.find(
                category => category.key === CATEGORY_KEY.TABLES,
            );
            const viewsCategory = visibleCategories.find(
                category => category.key === CATEGORY_KEY.VIEWS,
            );
            updateExplorerUiState({
                activeCategoryKey: (tablesCategory || viewsCategory || visibleCategories[0]).key,
            });
        }
    }, [activeCategoryKey, updateExplorerUiState, visibleCategories]);

    // `isFiltering` comes from the model, which also uses it to force-expand
    // every schema — keeping one source means the rows and the expansion can
    // never disagree about whether a filter is active.
    const emptyMessage = useMemo(() => {
        if (isLoading && !hasLoadedSchemas) return 'Loading schemas...';
        if (!activeCategory) return 'No categories found';
        return isFiltering ? 'No matches in this group' : 'No objects';
    }, [activeCategory, hasLoadedSchemas, isFiltering, isLoading]);

    return (
        <div className='flex flex-col h-full overflow-hidden' data-tour='database-explorer'>
            <ExplorerToolbar
                filter={filter}
                fuzzyMatch={fuzzyMatch}
                selectedSchema={selectedSchema}
                showMoreCategories={showMoreCategories}
                hasSecondaryCategories={secondaryCategories.length > 0}
                availableSchemas={availableSchemas}
                filterInputRef={filterInputRef}
                updateExplorerUiState={updateExplorerUiState}
            />

            <div className='flex-1 min-h-0 flex flex-col p-0.5 overflow-hidden'>
                <CategoryList
                    categories={visibleCategories}
                    activeCategoryKey={activeCategory?.key}
                    onSelectCategory={categoryKey =>
                        updateExplorerUiState({ activeCategoryKey: categoryKey })
                    }
                    onExitDown={() => focusTreeRowRef.current?.(0)}
                    focusCategoryRef={focusCategoryRef}
                />

                <div
                    ref={objectListRef}
                    className={cn(
                        'min-h-0 flex-1',
                        // The list owns its own scrolling: the virtualizer needs
                        // this element as its scroll host.
                        'overflow-y-auto overflow-x-hidden',
                    )}
                >
                    <ExplorerList
                        category={activeCategory}
                        isSchemaExpanded={isSchemaExpanded}
                        isFiltering={isFiltering}
                        scrollRef={objectListRef}
                        onScrollToIndexReady={registerScrollToIndex}
                        emptyMessage={emptyMessage}
                        driver={driver}
                        readOnlyMode={viewMode}
                        selectedObjectKey={selectedObjectKey}
                        onToggleSchema={toggleSchema}
                        onCreateTable={handleCreateTable}
                        onSelectObject={handleSelectObject}
                        onOpenDefinition={handleOpenDefinition}
                        onOpenCatalog={handleOpenCatalog}
                        onDropObject={handleDropObject}
                        onTruncateTable={handleTruncateTable}
                        onRefreshSchema={handleRefreshSchema}
                        onExportData={handleExportData}
                        onImportData={handleImportData}
                        onExitUp={() => focusCategoryRef.current?.()}
                        focusRowRef={focusTreeRowRef}
                    />
                </div>
            </div>
            {writeSafetyModals}
        </div>
    );
};
