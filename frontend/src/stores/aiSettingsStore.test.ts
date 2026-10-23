// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiGateway } from '../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../platform/apiGatewayRuntime';
import type { AISettingsView } from '../lib/aiAssistant';
import { useAISettingsStore } from './aiSettingsStore';

function view(overrides: Partial<AISettingsView> = {}): AISettingsView {
    return {
        enabled: true,
        allowCloud: true,
        baseURL: 'https://api.deepseek.com/v1',
        model: 'deepseek-reasoner',
        allowedHosts: [],
        disabledConnectionIDs: [],
        includeBodies: false,
        includeConnectionDetails: false,
        allowReadData: false,
        allowChanges: false,
        allowAudit: false,
        allowProduction: false,
        dataMode: false,
        dataPolicyNotice: false,
        autoApprove: false,
        connectionDisabled: false,
        keyHint: '••••abcd',
        hasKey: true,
        acpAvailable: false,
        mcpAvailable: false,
        airgap: false,
        production: false,
        providers: [
            {
                id: 'codex',
                label: 'Codex',
                host: 'api.openai.com',
                baseURL: 'https://api.openai.com/v1/responses',
                model: 'gpt-5-codex',
                hasKey: false,
                keyHint: '',
                active: false,
                models: [],
            },
            {
                id: 'deepseek',
                label: 'DeepSeek',
                host: 'api.deepseek.com',
                baseURL: 'https://api.deepseek.com/v1',
                model: 'deepseek-chat',
                hasKey: true,
                keyHint: '••••abcd',
                active: true,
                models: [],
            },
        ],
        ...overrides,
    };
}

describe('aiSettingsStore', () => {
    afterEach(() => {
        resetApiGateway();
        useAISettingsStore.setState({ settings: null, error: '', status: '', busy: false });
    });

    it('lists models on an auto load for the active provider with a key', async () => {
        const listModels = vi.fn(async () => ({
            ok: true as const,
            data: { host: 'api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
        }));
        const withModels = view({
            providers: view().providers.map(item =>
                item.active ? { ...item, models: ['deepseek-chat', 'deepseek-reasoner'] } : item,
            ),
        });
        const getSettings = vi
            .fn()
            .mockResolvedValueOnce({ ok: true as const, data: view() })
            .mockResolvedValueOnce({ ok: true as const, data: withModels });
        setApiGateway({ ai: { getSettings, listModels } } as unknown as ApiGateway);

        await useAISettingsStore.getState().load({ auto: true });

        expect(listModels).toHaveBeenCalledTimes(1);
        expect(listModels).toHaveBeenCalledWith('api.deepseek.com');
        expect(useAISettingsStore.getState().settings?.providers[1].models).toHaveLength(2);
    });

    it('treats a null model list from the backend as empty', async () => {
        const nullModels = view({
            providers: view().providers.map(item => ({
                ...item,
                models: null as unknown as string[],
            })),
        });
        setApiGateway({
            ai: { getSettings: async () => ({ ok: true as const, data: nullModels }) },
        } as unknown as ApiGateway);

        await useAISettingsStore.getState().load();

        const providers = useAISettingsStore.getState().settings?.providers ?? [];
        expect(providers.every(item => Array.isArray(item.models))).toBe(true);
    });

    it('takes the model the backend chose after Test and does not pick one itself', async () => {
        const chosen = view({
            model: 'deepseek-chat',
            providers: view().providers.map(item =>
                item.active ? { ...item, models: ['deepseek-chat', 'deepseek-reasoner'] } : item,
            ),
        });
        const setSettings = vi.fn();
        setApiGateway({
            ai: {
                listModels: async () => ({
                    ok: true as const,
                    data: {
                        host: 'api.deepseek.com',
                        models: ['deepseek-chat', 'deepseek-reasoner'],
                    },
                }),
                getSettings: async () => ({ ok: true as const, data: chosen }),
                setSettings,
            },
        } as unknown as ApiGateway);
        useAISettingsStore.setState({ settings: view({ model: '' }) });

        await useAISettingsStore.getState().testProvider('api.deepseek.com');

        expect(setSettings).not.toHaveBeenCalled();
        expect(useAISettingsStore.getState().settings?.model).toBe('deepseek-chat');
        expect(useAISettingsStore.getState().status).toContain('2 models loaded');
    });

    it('does not list models on a plain load', async () => {
        const listModels = vi.fn();
        setApiGateway({
            ai: { getSettings: async () => ({ ok: true as const, data: view() }), listModels },
        } as unknown as ApiGateway);

        await useAISettingsStore.getState().load();

        expect(listModels).not.toHaveBeenCalled();
    });

    it('selects a model through the shared save path', async () => {
        const setSettings = vi.fn(async () => ({
            ok: true as const,
            data: view({ model: 'deepseek-chat' }),
        }));
        setApiGateway({ ai: { setSettings } } as unknown as ApiGateway);
        useAISettingsStore.setState({ settings: view() });

        await useAISettingsStore.getState().selectModel('deepseek-chat');

        expect(setSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'deepseek-chat',
                baseURL: 'https://api.deepseek.com/v1',
            }),
        );
        expect(useAISettingsStore.getState().settings?.model).toBe('deepseek-chat');
    });

    it('keeps the error on the store when a call fails', async () => {
        setApiGateway({
            ai: {
                clearKey: vi.fn(async () => ({
                    ok: false as const,
                    error: { code: 'x', message: 'keyring locked' },
                })),
            },
        } as unknown as ApiGateway);

        await useAISettingsStore.getState().clearKey('api.deepseek.com');

        expect(useAISettingsStore.getState().error).toContain('keyring locked');
        expect(useAISettingsStore.getState().busy).toBe(false);
    });
});
