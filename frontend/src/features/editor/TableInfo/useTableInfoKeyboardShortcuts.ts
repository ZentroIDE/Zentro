// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import type { TableInfoTab } from './types';

interface UseTableInfoKeyboardShortcutsArgs {
    isTableTabActive: boolean;
    activeTab: TableInfoTab;
    hasChanges: boolean;
    saving: boolean;
    viewMode: boolean;
    isCreateMode: boolean;
    filterTabs: Set<TableInfoTab>;
    filterInputRef: React.RefObject<HTMLInputElement | null>;
    saveColumns: () => Promise<unknown>;
    tabReload: Record<TableInfoTab, () => void>;
}

export function useTableInfoKeyboardShortcuts({
    isTableTabActive,
    activeTab,
    hasChanges,
    saving,
    viewMode,
    isCreateMode,
    filterTabs,
    filterInputRef,
    saveColumns,
    tabReload,
}: UseTableInfoKeyboardShortcutsArgs) {
    React.useEffect(() => {
        const handleKeyboardShortcut = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (!isTableTabActive) return;

            if (event.key === 'F5') {
                event.preventDefault();
                tabReload[activeTab]();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (activeTab === 'columns' && hasChanges && !saving && !viewMode) {
                    void saveColumns();
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                if (isCreateMode || !filterTabs.has(activeTab)) return;
                const activeElement = document.activeElement;
                if (activeElement?.closest('.sidebar')) return;
                event.preventDefault();
                setTimeout(() => filterInputRef.current?.focus(), 10);
            }
        };

        window.addEventListener('keydown', handleKeyboardShortcut);
        return () => window.removeEventListener('keydown', handleKeyboardShortcut);
    }, [
        activeTab,
        filterInputRef,
        filterTabs,
        hasChanges,
        isCreateMode,
        isTableTabActive,
        saveColumns,
        saving,
        tabReload,
        viewMode,
    ]);
}
