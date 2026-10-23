// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import {
    DEFAULT_ENABLED_KINDS,
    PRIMARY_VISIBLE_KINDS,
    type ObjectKind,
} from '../lib/contextSearchTemplates';

/**
 * Object-kind filter state for the Spotlight palette's schema search mode,
 * shared between the kind toggle bar (input accessory) and the results list.
 * At least one kind stays enabled; collapsing the bar trims the selection back
 * to the primary kinds.
 */
interface ContextSearchKindState {
    enabledKinds: Set<ObjectKind>;
    showAllKinds: boolean;

    toggleKind: (kind: ObjectKind) => void;
    toggleShowAllKinds: () => void;
}

export const useContextSearchKindStore = create<ContextSearchKindState>((set, get) => ({
    enabledKinds: new Set(DEFAULT_ENABLED_KINDS),
    showAllKinds: false,

    toggleKind: kind => {
        const next = new Set(get().enabledKinds);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        if (next.size === 0) next.add(kind);
        set({ enabledKinds: next });
    },

    toggleShowAllKinds: () => {
        const next = !get().showAllKinds;
        if (!next) {
            const filteredSet = new Set(
                [...get().enabledKinds].filter(kind => PRIMARY_VISIBLE_KINDS.includes(kind)),
            );
            if (filteredSet.size === 0) {
                PRIMARY_VISIBLE_KINDS.forEach(kind => filteredSet.add(kind));
            }
            set({ showAllKinds: next, enabledKinds: filteredSet });
            return;
        }
        set({ showAllKinds: next });
    },
}));
