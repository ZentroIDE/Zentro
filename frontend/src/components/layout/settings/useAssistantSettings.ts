// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useAISettingsStore } from '../../../stores/aiSettingsStore';
import type { AISettingsView } from '../../../lib/aiAssistant';

// AssistantSettingsModel is what the Assistant settings rows show and can do.
// The component that draws them only reads this; the stores stay here.
export interface AssistantSettingsModel {
    settings: AISettingsView | null;
    busy: boolean;
    error: string;
    status: string;
    // False when no connection is open, so the per-connection switch is off.
    hasConnection: boolean;
    setEnabled: (on: boolean) => void;
    setConnectionDisabled: (on: boolean) => void;
    setIncludeBodies: (on: boolean) => void;
    setIncludeConnectionDetails: (on: boolean) => void;
    setAllowReadData: (on: boolean) => void;
    setDataMode: (on: boolean) => void;
    dismissDataPolicyNotice: () => void;
    setAllowChanges: (on: boolean) => void;
    setAllowAudit: (on: boolean) => void;
    setAllowProduction: (on: boolean) => void;
    connectionId: string;
    selectProvider: (id: string) => void;
    selectModel: (model: string) => void;
    // testKey saves draft when it is not empty, then loads the models. It
    // resolves true when that worked, so the caller can clear the draft.
    testKey: (host: string, draft: string) => Promise<boolean>;
    clearKey: (host: string) => void;
}

// useAssistantSettings wires the Assistant section to the shared AI settings
// store, the same store the chat panel uses.
export function useAssistantSettings(): AssistantSettingsModel {
    const profile = useConnectionStore(state => state.activeProfile);
    const settings = useAISettingsStore(state => state.settings);
    const error = useAISettingsStore(state => state.error);
    const status = useAISettingsStore(state => state.status);
    const busy = useAISettingsStore(state => state.busy);
    const load = useAISettingsStore(state => state.load);
    const save = useAISettingsStore(state => state.save);
    const selectProvider = useAISettingsStore(state => state.selectProvider);
    const selectModel = useAISettingsStore(state => state.selectModel);
    const testProvider = useAISettingsStore(state => state.testProvider);
    const clearKey = useAISettingsStore(state => state.clearKey);

    useEffect(() => {
        void load({ auto: true });
    }, [load]);

    return {
        settings,
        busy,
        error,
        status,
        hasConnection: Boolean(profile?.id),
        setEnabled: on => {
            if (settings) void save({ ...settings, enabled: on });
        },
        setConnectionDisabled: on => {
            const id = profile?.id;
            if (!settings || !id) return;
            const ids = new Set(settings.disabledConnectionIDs ?? []);
            if (on) ids.add(id);
            else ids.delete(id);
            void save({ ...settings, disabledConnectionIDs: [...ids] });
        },
        setIncludeBodies: on => {
            if (settings) void save({ ...settings, includeBodies: on });
        },
        setIncludeConnectionDetails: on => {
            if (settings) void save({ ...settings, includeConnectionDetails: on });
        },
        setAllowReadData: on => {
            if (settings) void save({ ...settings, allowReadData: on });
        },
        setAllowChanges: on => {
            if (settings) void save({ ...settings, allowChanges: on });
        },
        setDataMode: on => {
            if (settings) void save({ ...settings, dataMode: on });
        },
        // The backend clears the notice on any save, so saving as-is dismisses it.
        dismissDataPolicyNotice: () => {
            if (settings) void save({ ...settings });
        },
        setAllowAudit: on => {
            if (settings) void save({ ...settings, allowAudit: on });
        },
        setAllowProduction: on => {
            if (settings) void save({ ...settings, allowProduction: on });
        },
        connectionId: profile?.id ?? '',
        selectProvider: id => void selectProvider(id),
        selectModel: model => void selectModel(model),
        testKey: async (host, draft) => {
            await testProvider(host, draft);
            return !useAISettingsStore.getState().error;
        },
        clearKey: host => void clearKey(host),
    };
}
