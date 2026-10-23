// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';

/**
 * A section an edition contributes above the commit list in the Source
 * Control panel's History tab (e.g. Pro's schema rollback). The core renders
 * whatever is registered and knows nothing about who registered it — see
 * SourceControlHistoryView.tsx and ADR 0019.
 */
export interface HistorySectionDefinition {
    id: string;
    order: number;
    render: () => React.ReactNode;
}

interface RegistryStore {
    byId: Map<string, HistorySectionDefinition>;
    snapshot: HistorySectionDefinition[];
    listeners: Set<() => void>;
}

const STORE_KEY = '__zentroSourceControlHistorySectionRegistry__';

function getRegistryStore(): RegistryStore {
    const host = globalThis as typeof globalThis & {
        [STORE_KEY]?: RegistryStore;
    };
    if (!host[STORE_KEY]) {
        host[STORE_KEY] = {
            byId: new Map(),
            snapshot: [],
            listeners: new Set(),
        };
    }
    return host[STORE_KEY]!;
}

function rebuildSnapshot(): void {
    const store = getRegistryStore();
    store.snapshot = Array.from(store.byId.values()).sort((left, right) => {
        if (left.order !== right.order) return left.order - right.order;
        return left.id.localeCompare(right.id);
    });
}

function notifyListeners(): void {
    getRegistryStore().listeners.forEach(listener => listener());
}

export function registerHistorySection(definition: HistorySectionDefinition): () => void {
    const store = getRegistryStore();
    store.byId.set(definition.id, definition);
    rebuildSnapshot();
    notifyListeners();

    return () => {
        if (!store.byId.delete(definition.id)) return;
        rebuildSnapshot();
        notifyListeners();
    };
}

export function getHistorySections(): HistorySectionDefinition[] {
    return getRegistryStore().snapshot;
}

export function subscribeHistorySections(listener: () => void): () => void {
    const store = getRegistryStore();
    store.listeners.add(listener);
    return () => {
        store.listeners.delete(listener);
    };
}

export function useHistorySections(): HistorySectionDefinition[] {
    return React.useSyncExternalStore(
        subscribeHistorySections,
        getHistorySections,
        getHistorySections,
    );
}
