// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';

/**
 * Git branch state shared between the Toolbar (current-branch label) and the
 * Spotlight palette's `@git` mode (checkout/create actions). Actions throw on
 * failure; callers own toasts and closing any surrounding UI.
 */
interface GitBranchState {
    branch: string;
    branches: string[];
    loading: boolean;
    busy: boolean;

    load: (hasGitRepo: boolean) => Promise<void>;
    checkout: (name: string) => Promise<void>;
    createBranch: (name: string) => Promise<'created' | 'checked-out'>;
    createBranchFrom: (name: string, fromRef: string) => Promise<'created' | 'checked-out'>;
    checkoutDetached: (ref: string) => Promise<void>;
}

export const useGitBranchStore = create<GitBranchState>((set, get) => ({
    branch: '',
    branches: [],
    loading: false,
    busy: false,

    load: async hasGitRepo => {
        if (!hasGitRepo) {
            set({ branch: '', branches: [] });
            return;
        }
        set({ loading: true });
        try {
            const [statusResult, branchesResult] = await Promise.all([
                getApiGateway().sourceControl.getStatus(),
                getApiGateway().sourceControl.listBranches(),
            ]);
            const status = unwrapOrThrow(statusResult);
            const branches = unwrapOrThrow(branchesResult);
            set({
                branch: status.branch || '',
                branches: Array.from(new Set((branches || []).filter(Boolean))),
            });
        } catch {
            set({ branches: [] });
        } finally {
            set({ loading: false });
        }
    },

    checkout: async name => {
        const next = name.trim();
        if (!next || get().busy) return;
        set({ busy: true });
        try {
            unwrapOrThrow(await getApiGateway().sourceControl.checkoutBranch(next));
            await get().load(true);
        } finally {
            set({ busy: false });
        }
    },

    createBranch: async name => {
        const next = name.trim();
        if (!next || get().busy) return 'checked-out';
        set({ busy: true });
        try {
            const latest = unwrapOrThrow(await getApiGateway().sourceControl.listBranches());
            const exists = (latest || []).some(
                (b: string) => b.toLowerCase() === next.toLowerCase(),
            );
            if (exists) {
                unwrapOrThrow(await getApiGateway().sourceControl.checkoutBranch(next));
            } else {
                unwrapOrThrow(await getApiGateway().sourceControl.createBranch(next));
            }
            await get().load(true);
            return exists ? 'checked-out' : 'created';
        } finally {
            set({ busy: false });
        }
    },

    createBranchFrom: async (name, fromRef) => {
        const next = name.trim();
        const base = fromRef.trim();
        if (!next || !base || get().busy) return 'checked-out';
        set({ busy: true });
        try {
            const latest = unwrapOrThrow(await getApiGateway().sourceControl.listBranches());
            const exists = (latest || []).some(
                (b: string) => b.toLowerCase() === next.toLowerCase(),
            );
            if (exists) {
                unwrapOrThrow(await getApiGateway().sourceControl.checkoutBranch(next));
            } else {
                unwrapOrThrow(await getApiGateway().sourceControl.createBranchFrom(next, base));
            }
            await get().load(true);
            return exists ? 'checked-out' : 'created';
        } finally {
            set({ busy: false });
        }
    },

    checkoutDetached: async ref => {
        const target = ref.trim();
        if (!target || get().busy) return;
        set({ busy: true });
        try {
            unwrapOrThrow(await getApiGateway().sourceControl.checkoutDetached(target));
            await get().load(true);
        } finally {
            set({ busy: false });
        }
    },
}));
