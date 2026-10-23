// SPDX-License-Identifier: GPL-3.0-only

import * as React from 'react';
import type { ThemePreset } from './themePresetTypes';

interface RegistryStore {
    byId: Map<string, ThemePreset>;
    snapshot: ThemePreset[];
    listeners: Set<() => void>;
}

const STORE_KEY = '__zentroThemePresetRegistry__';

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
        if (left.appearance !== right.appearance) {
            return left.appearance === 'light' ? -1 : 1;
        }
        return left.id.localeCompare(right.id);
    });
}

function notifyListeners(): void {
    getRegistryStore().listeners.forEach(listener => listener());
}

export function registerThemePreset(preset: ThemePreset, options?: { replace?: boolean }): void {
    const store = getRegistryStore();
    const existed = store.byId.has(preset.id);

    if (existed && !options?.replace) return;
    store.byId.set(preset.id, preset);
    rebuildSnapshot();
    notifyListeners();
}

export function unregisterThemePreset(presetId: string): void {
    const store = getRegistryStore();
    if (!store.byId.delete(presetId)) return;
    rebuildSnapshot();
    notifyListeners();
}

export function getThemePresets(): ThemePreset[] {
    return getRegistryStore().snapshot;
}

export function getThemePreset(presetId: string): ThemePreset | undefined {
    return getRegistryStore().byId.get(presetId);
}

export function subscribeThemePresets(listener: () => void): () => void {
    const store = getRegistryStore();
    store.listeners.add(listener);
    return () => {
        store.listeners.delete(listener);
    };
}

export function useThemePresets(): ThemePreset[] {
    return React.useSyncExternalStore(subscribeThemePresets, getThemePresets, getThemePresets);
}
