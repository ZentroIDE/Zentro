// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { CommandId } from '../../../lib/shortcutRegistry';

export interface BottomPanelDefinition {
    id: string;
    label: string;
    /** Hover tooltip, e.g. "Audit (Ctrl+Shift+L)". */
    title: string;
    icon: LucideIcon;
    order: number;
    render: () => React.ReactNode;
    getBadge?: () => string | number | null | undefined;
    /** Optional dedicated toggle command, registered separately via shortcutRegistry.ts. */
    commandId?: CommandId;
}

interface RegistryStore {
    byId: Map<string, BottomPanelDefinition>;
    snapshot: BottomPanelDefinition[];
    listeners: Set<() => void>;
}

const STORE_KEY = '__zentroBottomPanelRegistry__';

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

export function registerBottomPanel(
    definition: BottomPanelDefinition,
    options?: { replace?: boolean },
): void {
    const store = getRegistryStore();
    const existed = store.byId.has(definition.id);

    if (existed && !options?.replace) return;
    store.byId.set(definition.id, definition);
    rebuildSnapshot();
    notifyListeners();
}

export function unregisterBottomPanel(panelId: string): void {
    const store = getRegistryStore();
    if (!store.byId.delete(panelId)) return;
    rebuildSnapshot();
    notifyListeners();
}

export function getBottomPanels(): BottomPanelDefinition[] {
    return getRegistryStore().snapshot;
}

export function subscribeBottomPanels(listener: () => void): () => void {
    const store = getRegistryStore();
    store.listeners.add(listener);
    return () => {
        store.listeners.delete(listener);
    };
}

export function useBottomPanels(): BottomPanelDefinition[] {
    return React.useSyncExternalStore(subscribeBottomPanels, getBottomPanels, getBottomPanels);
}
