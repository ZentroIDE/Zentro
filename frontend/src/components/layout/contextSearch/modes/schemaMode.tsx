// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { getApiGateway } from '../../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../../shared/kernel';
import { useConnectionStore } from '../../../../stores/connectionStore';
import { useContextSearchKindStore } from '../../../../stores/contextSearchKindStore';
import { useEditorStore } from '../../../../stores/editorStore';
import { useEnvironmentStore } from '../../../../stores/environmentStore';
import { useSchemaStore } from '../../../../stores/schemaStore';
import { buildItems, fuzzyScore, type SearchItem } from '../../../../lib/contextSearchTemplates';
import { getErrorMessage } from '../../../../lib/errors';
import { onSchemaLoaded } from '../../../../lib/events';
import { CommandEmpty } from '../../../ui';
import { useToast } from '../../Toast';
import { ObjectKindToggleBar } from '../ObjectKindToggleBar';
import { SearchResultContextMenu, type ContextSearchAction } from '../SearchResultContextMenu';
import { SearchResultRow } from '../SearchResultRow';
import { useContextSearchMenuActions } from '../useContextSearchMenuActions';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

interface ItemContextMenu {
    x: number;
    y: number;
    item: SearchItem;
}

const SchemaKindToggleBar: React.FC = () => {
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const enabledKinds = useContextSearchKindStore(state => state.enabledKinds);
    const showAllKinds = useContextSearchKindStore(state => state.showAllKinds);
    const toggleKind = useContextSearchKindStore(state => state.toggleKind);
    const toggleShowAllKinds = useContextSearchKindStore(state => state.toggleShowAllKinds);

    return (
        <ObjectKindToggleBar
            dbName={activeProfile?.db_name || ''}
            showAllKinds={showAllKinds}
            enabledKinds={enabledKinds}
            onToggleKind={toggleKind}
            onToggleShowAllKinds={toggleShowAllKinds}
        />
    );
};

const SchemaResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const { toast } = useToast();
    const { activeProfile, isConnected } = useConnectionStore();
    const setTree = useSchemaStore(state => state.setTree);
    const setLoading = useSchemaStore(state => state.setLoading);
    const addTab = useEditorStore(state => state.addTab);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const enabledKinds = useContextSearchKindStore(state => state.enabledKinds);

    const profileName = activeProfile?.name || '';
    const dbName = activeProfile?.db_name || '';
    const schemaKey = `${profileName}:${dbName}`;
    const schemas = useSchemaStore(state => state.trees[schemaKey]);
    const isLoading = useSchemaStore(state => state.loadingKeys.has(schemaKey));

    const [contextMenu, setContextMenu] = React.useState<ItemContextMenu | null>(null);

    React.useEffect(() => {
        if (!isConnected || !profileName || !dbName || schemas || isLoading) return;
        setLoading(profileName, dbName, true);
        getApiGateway()
            .schema.fetchDatabaseSchema(profileName, dbName)
            .then(unwrapOrThrow)
            .catch(error => {
                setLoading(profileName, dbName, false);
                toast.error(`Failed to load schema: ${getErrorMessage(error)}`);
            });
    }, [dbName, isConnected, isLoading, profileName, schemas, setLoading, toast]);

    React.useEffect(() => {
        const offLoaded = onSchemaLoaded(payload => {
            if (payload.profileName !== profileName || payload.dbName !== dbName) return;
            setTree(profileName, dbName, payload.schemas);
            setLoading(profileName, dbName, false);
        });

        return () => {
            if (typeof offLoaded === 'function') offLoaded();
        };
    }, [dbName, profileName, setLoading, setTree]);

    const allItems = React.useMemo(() => buildItems(schemas), [schemas]);

    const filtered = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const base = allItems.filter(item => enabledKinds.has(item.kind));
        if (!normalizedQuery) return base.slice(0, 400);

        return base
            .map(item => ({ item, score: fuzzyScore(normalizedQuery, item.keywords) }))
            .filter(entry => entry.score > 0)
            .sort((left, right) => right.score - left.score)
            .map(entry => entry.item)
            .slice(0, 400);
    }, [allItems, enabledKinds, query]);

    const { runItemAction } = useContextSearchMenuActions({
        driver: activeProfile?.driver,
        connectionID: activeProfile?.id,
        dbName: activeProfile?.db_name,
        environmentKey: activeEnvironmentKey,
        addTab,
        onClose,
        toast,
    });

    const emptyMessage = React.useMemo(() => {
        if (!isConnected || !activeProfile) return 'No active connection';
        if (isLoading && !schemas) return 'Loading schema...';
        if (!schemas) return 'No schema loaded';
        return `No matches for "${query}"`;
    }, [activeProfile, query, isConnected, isLoading, schemas]);

    return (
        <>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {filtered.map(item => (
                <SearchResultRow
                    key={item.id}
                    item={item}
                    onSelect={selectedItem => {
                        void runItemAction(selectedItem, 'browse');
                    }}
                    onContextMenu={(event, selectedItem) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            item: selectedItem,
                        });
                    }}
                />
            ))}

            <SearchResultContextMenu
                open={Boolean(contextMenu)}
                position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
                item={contextMenu?.item ?? null}
                onOpenChange={open => {
                    if (!open) setContextMenu(null);
                }}
                onAction={(item, action: ContextSearchAction) => {
                    setContextMenu(null);
                    void runItemAction(item, action);
                }}
            />
        </>
    );
};

export const schemaMode: SearchModeDescriptor = {
    id: 'schema',
    prefix: null,
    description: 'Search tables, views, functions and other schema objects',
    placeholder: 'Search tables, views, functions... (? for more scopes), esc to close',
    dialogTitle: 'Search',
    Results: SchemaResults,
    InputAccessory: SchemaKindToggleBar,
};
