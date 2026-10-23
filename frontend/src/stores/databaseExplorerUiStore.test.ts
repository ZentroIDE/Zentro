// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabaseExplorerUiStore } from './databaseExplorerUiStore';

const TREE_KEY = 'profile:db:postgres';

describe('databaseExplorerUiStore', () => {
    beforeEach(() => {
        useDatabaseExplorerUiStore.setState({ treeStateByKey: {} });
        (
            useDatabaseExplorerUiStore as unknown as {
                persist?: { clearStorage?: () => void };
            }
        ).persist?.clearStorage?.();
    });

    it('applies default expanded category only once', () => {
        const store = useDatabaseExplorerUiStore.getState();
        store.ensureDefaults(TREE_KEY, 'tables');

        let state = useDatabaseExplorerUiStore.getState().treeStateByKey[TREE_KEY];
        expect(state.defaultsApplied).toBe(true);
        expect(state.expandedCategories).toContain('tables');

        store.toggleCategory(TREE_KEY, 'views');
        store.ensureDefaults(TREE_KEY, 'tables');

        state = useDatabaseExplorerUiStore.getState().treeStateByKey[TREE_KEY];
        expect(state.expandedCategories).toContain('views');
    });

    it('toggles schema expansion per category', () => {
        const store = useDatabaseExplorerUiStore.getState();
        store.ensureDefaults(TREE_KEY, 'tables');

        store.toggleSchema(TREE_KEY, 'tables', 'public');
        let state = useDatabaseExplorerUiStore.getState().treeStateByKey[TREE_KEY];
        expect(state.expandedSchemasByCategory.tables).toEqual(['public']);

        store.toggleSchema(TREE_KEY, 'tables', 'public');
        state = useDatabaseExplorerUiStore.getState().treeStateByKey[TREE_KEY];
        expect(state.expandedSchemasByCategory.tables).toEqual([]);
    });
});
