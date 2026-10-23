// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEY } from '../lib/constants';

interface DatabaseExplorerExpandedState {
    expandedCategories: string[];
    expandedSchemasByCategory: Record<string, string[]>;
    defaultsApplied: boolean;
}

interface DatabaseExplorerUiState {
    treeStateByKey: Record<string, DatabaseExplorerExpandedState>;

    ensureDefaults: (treeKey: string, defaultCategoryKey: string) => void;
    toggleCategory: (treeKey: string, categoryKey: string) => void;
    toggleSchema: (treeKey: string, categoryKey: string, schemaName: string) => void;
}

function createEmptyTreeState(): DatabaseExplorerExpandedState {
    return {
        expandedCategories: [],
        expandedSchemasByCategory: {},
        defaultsApplied: false,
    };
}

function toArraySet(values: string[]): string[] {
    return Array.from(new Set(values));
}

export const useDatabaseExplorerUiStore = create<DatabaseExplorerUiState>()(
    persist(
        (set, get) => ({
            treeStateByKey: {},

            ensureDefaults: (treeKey, defaultCategoryKey) => {
                const current = get().treeStateByKey[treeKey];
                if (current?.defaultsApplied) return;

                const base = current || createEmptyTreeState();
                set(state => ({
                    treeStateByKey: {
                        ...state.treeStateByKey,
                        [treeKey]: {
                            ...base,
                            defaultsApplied: true,
                            expandedCategories: toArraySet([
                                ...base.expandedCategories,
                                defaultCategoryKey,
                            ]),
                        },
                    },
                }));
            },

            toggleCategory: (treeKey, categoryKey) =>
                set(state => {
                    const current = state.treeStateByKey[treeKey] || createEmptyTreeState();
                    const isExpanded = current.expandedCategories.includes(categoryKey);
                    const nextCategories = isExpanded
                        ? current.expandedCategories.filter(key => key !== categoryKey)
                        : [...current.expandedCategories, categoryKey];

                    return {
                        treeStateByKey: {
                            ...state.treeStateByKey,
                            [treeKey]: {
                                ...current,
                                defaultsApplied: true,
                                expandedCategories: nextCategories,
                            },
                        },
                    };
                }),

            toggleSchema: (treeKey, categoryKey, schemaName) =>
                set(state => {
                    const current = state.treeStateByKey[treeKey] || createEmptyTreeState();
                    const expandedForCategory =
                        current.expandedSchemasByCategory[categoryKey] || [];
                    const isExpanded = expandedForCategory.includes(schemaName);
                    const nextExpanded = isExpanded
                        ? expandedForCategory.filter(name => name !== schemaName)
                        : [...expandedForCategory, schemaName];

                    return {
                        treeStateByKey: {
                            ...state.treeStateByKey,
                            [treeKey]: {
                                ...current,
                                defaultsApplied: true,
                                expandedSchemasByCategory: {
                                    ...current.expandedSchemasByCategory,
                                    [categoryKey]: nextExpanded,
                                },
                            },
                        },
                    };
                }),
        }),
        {
            name: STORAGE_KEY.DATABASE_EXPLORER_UI,
            partialize: state => ({
                treeStateByKey: state.treeStateByKey,
            }),
        },
    ),
);
