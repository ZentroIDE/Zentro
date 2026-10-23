// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { kernelErrorMessage, type KernelError } from '../shared/kernel';
import {
    activeAIProvider,
    chatProviders,
    normalizeAISettings,
    toProjectSettings,
    type AISettingsView,
} from '../lib/aiAssistant';

// The assistant settings shared by Settings > Assistant and the chat panel.
// The API key never enters this store. A key draft stays in the component
// that is typing it.
interface AISettingsState {
    settings: AISettingsView | null;
    error: string;
    status: string;
    busy: boolean;

    // load reads the view. With auto set, it also lists models for the active
    // provider when it has a key and no cached list yet.
    load: (options?: { auto?: boolean }) => Promise<void>;
    // save writes the project switches (enabled, connection off) from a view.
    save: (next: AISettingsView) => Promise<void>;
    selectProvider: (id: string) => Promise<void>;
    selectModel: (model: string) => Promise<void>;
    // testProvider saves draft first when given, then lists models for host.
    testProvider: (host: string, draft?: string) => Promise<void>;
    clearKey: (host: string) => Promise<void>;
}

let loading = false;

export const useAISettingsStore = create<AISettingsState>()((set, get) => {
    const fail = (error: KernelError) => {
        set({ error: kernelErrorMessage(error), busy: false });
    };

    const listModels = async (host: string) => {
        const listed = await getApiGateway().ai.listModels(host);
        if (!listed.ok) {
            fail(listed.error);
            return false;
        }
        return true;
    };

    const refresh = async (auto: boolean) => {
        const response = await getApiGateway().ai.getSettings();
        if (!response.ok) {
            fail(response.error);
            return;
        }
        set({ settings: normalizeAISettings(response.data) });
        const active = activeAIProvider(response.data);
        if (!auto || !active || !active.hasKey || active.models.length > 0) return;
        if (loading) return;
        loading = true;
        try {
            if (await listModels(active.host)) {
                const again = await getApiGateway().ai.getSettings();
                if (again.ok) set({ settings: normalizeAISettings(again.data) });
            }
        } finally {
            loading = false;
        }
    };

    return {
        settings: null,
        error: '',
        status: '',
        busy: false,

        load: async options => {
            await refresh(Boolean(options?.auto));
        },

        save: async next => {
            set({ busy: true, error: '', status: '' });
            const response = await getApiGateway().ai.setSettings(toProjectSettings(next));
            set({ busy: false });
            if (!response.ok) return fail(response.error);
            set({ settings: normalizeAISettings(response.data) });
        },

        selectProvider: async id => {
            const current = get().settings;
            if (!current) return;
            const next = chatProviders(current).find(item => item.id === id);
            if (!next || next.active) return;
            set({ busy: true, error: '', status: '' });
            const response = await getApiGateway().ai.setSettings(
                toProjectSettings({
                    ...current,
                    enabled: true,
                    allowCloud: true,
                    baseURL: next.baseURL,
                    model: next.model,
                }),
            );
            set({ busy: false });
            if (!response.ok) return fail(response.error);
            set({ settings: normalizeAISettings(response.data) });
            if (next.hasKey && next.models.length === 0) {
                await get().load({ auto: true });
            }
        },

        selectModel: async model => {
            const current = get().settings;
            if (!current || current.model === model) return;
            set({ busy: true, error: '' });
            const response = await getApiGateway().ai.setSettings(
                toProjectSettings({ ...current, model }),
            );
            set({ busy: false });
            if (!response.ok) return fail(response.error);
            set({ settings: normalizeAISettings(response.data) });
        },

        testProvider: async (host, draft) => {
            set({ busy: true, error: '', status: '' });
            const trimmed = (draft ?? '').trim();
            if (trimmed) {
                const saved = await getApiGateway().ai.saveKey(trimmed, host);
                if (!saved.ok) return fail(saved.error);
                set({ settings: normalizeAISettings(saved.data) });
            }
            const listed = await getApiGateway().ai.listModels(host);
            if (!listed.ok) return fail(listed.error);
            // The backend picks the model from the list it just stored, so the
            // settings read here already hold it.
            const view = await getApiGateway().ai.getSettings();
            if (!view.ok) return fail(view.error);
            set({
                settings: normalizeAISettings(view.data),
                busy: false,
                status: `Key works. ${listed.data.models?.length ?? 0} models loaded.`,
            });
        },

        clearKey: async host => {
            set({ busy: true, error: '', status: '' });
            const response = await getApiGateway().ai.clearKey(host);
            set({ busy: false });
            if (!response.ok) return fail(response.error);
            set({ settings: normalizeAISettings(response.data) });
        },
    };
});
