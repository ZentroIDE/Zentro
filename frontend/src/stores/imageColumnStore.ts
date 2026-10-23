// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';

interface ImageColumnState {
    activeScopeKey: string | null;
    byTable: Record<string, Set<string>>; // tableKey ("schema.table") -> marked column names
    loadForConnection: (connectionKey: string) => Promise<void>;
    isMarked: (connectionKey: string, tableKey: string, column: string) => boolean;
    toggleMark: (connectionKey: string, tableKey: string, column: string) => Promise<void>;
}

export const useImageColumnStore = create<ImageColumnState>((set, get) => ({
    activeScopeKey: null,
    byTable: {},

    loadForConnection: async connectionKey => {
        if (!connectionKey) return;
        const result = await getApiGateway().imageColumn.getImageColumnsByConnection(connectionKey);
        const grouped = result.ok ? result.data : {};
        const byTable: Record<string, Set<string>> = {};
        Object.entries(grouped || {}).forEach(([tableKey, columns]) => {
            byTable[tableKey] = new Set(columns || []);
        });
        set({ activeScopeKey: connectionKey, byTable });
    },

    isMarked: (connectionKey, tableKey, column) => {
        const state = get();
        if (!connectionKey || state.activeScopeKey !== connectionKey) return false;
        return state.byTable[tableKey]?.has(column) ?? false;
    },

    toggleMark: async (connectionKey, tableKey, column) => {
        if (!connectionKey || !tableKey || !column) return;
        const state = get();
        const currentlyMarked =
            state.activeScopeKey === connectionKey
                ? (state.byTable[tableKey]?.has(column) ?? false)
                : false;
        const nextMarked = !currentlyMarked;

        unwrapOrThrow(
            await getApiGateway().imageColumn.setImageColumn(
                connectionKey,
                tableKey,
                column,
                nextMarked,
            ),
        );

        set(current => {
            const scopeMatches = current.activeScopeKey === connectionKey;
            const existingByTable = scopeMatches ? current.byTable : {};
            const nextColumns = new Set(existingByTable[tableKey] ?? []);
            if (nextMarked) {
                nextColumns.add(column);
            } else {
                nextColumns.delete(column);
            }
            return {
                activeScopeKey: connectionKey,
                byTable: { ...existingByTable, [tableKey]: nextColumns },
            };
        });
    },
}));
