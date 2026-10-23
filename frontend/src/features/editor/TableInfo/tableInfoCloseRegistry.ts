// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

type TableInfoCloseController = {
    hasUnsavedChanges: () => boolean;
    requestClose: () => void;
};

const closeControllers = new Map<string, TableInfoCloseController>();
const listeners = new Set<() => void>();

export type TableInfoCloseRequestResult = 'close-now' | 'blocked' | 'missing';

function notifyListeners(): void {
    listeners.forEach(listener => listener());
}

export function registerTableInfoCloseController(
    tabId: string,
    controller: TableInfoCloseController,
) {
    closeControllers.set(tabId, controller);
    notifyListeners();

    return () => {
        const current = closeControllers.get(tabId);
        if (current === controller) {
            closeControllers.delete(tabId);
            notifyListeners();
        }
    };
}

export function requestTableInfoClose(tabId: string): TableInfoCloseRequestResult {
    const controller = closeControllers.get(tabId);
    if (!controller) {
        return 'missing';
    }

    if (!controller.hasUnsavedChanges()) {
        return 'close-now';
    }

    controller.requestClose();
    return 'blocked';
}

export function hasTableInfoUnsavedChanges(tabId: string): boolean {
    return closeControllers.get(tabId)?.hasUnsavedChanges() ?? false;
}

export function subscribeTableInfoCloseRegistry(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useTableInfoUnsavedChanges(tabId: string): boolean {
    return React.useSyncExternalStore(
        subscribeTableInfoCloseRegistry,
        () => hasTableInfoUnsavedChanges(tabId),
        () => hasTableInfoUnsavedChanges(tabId),
    );
}
