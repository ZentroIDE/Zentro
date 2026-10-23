// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ApiGateway } from '../../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../../platform/apiGatewayRuntime';
import type { AISettingsView } from '../../../lib/aiAssistant';
import { useAISettingsStore } from '../../../stores/aiSettingsStore';
import { SettingsAssistant } from './SettingsAssistant';
import { useAssistantSettings, type AssistantSettingsModel } from './useAssistantSettings';
import { useMCPServerSettings, type MCPServerSettingsModel } from './useMCPServerSettings';

// Harness mounts the section the way SettingsView does: the hooks own the stores.
function Harness() {
    return <SettingsAssistant model={useAssistantSettings()} mcp={useMCPServerSettings()} />;
}

function view(overrides: Partial<AISettingsView> = {}): AISettingsView {
    return {
        enabled: false,
        allowCloud: false,
        baseURL: '',
        model: '',
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
        keyHint: '',
        hasKey: false,
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
                hasKey: false,
                keyHint: '',
                active: false,
                models: [],
            },
        ],
        ...overrides,
    };
}

describe('SettingsAssistant', () => {
    afterEach(() => {
        resetApiGateway();
        useAISettingsStore.setState({ settings: null, error: '', status: '', busy: false });
    });

    it('asks for a key after Use, then loads models after Test', async () => {
        let current = view();
        const setSettings = vi.fn(async () => {
            current = {
                ...current,
                enabled: true,
                allowCloud: true,
                baseURL: 'https://api.openai.com/v1/responses',
                model: 'gpt-5-codex',
                providers: current.providers.map(item =>
                    item.id === 'codex' ? { ...item, active: true } : item,
                ),
            };
            return { ok: true as const, data: current };
        });
        const saveKey = vi.fn(async () => {
            current = {
                ...current,
                providers: current.providers.map(item =>
                    item.id === 'codex' ? { ...item, hasKey: true, keyHint: '••••abcd' } : item,
                ),
            };
            return { ok: true as const, data: current };
        });
        const listModels = vi.fn(async () => {
            current = {
                ...current,
                providers: current.providers.map(item =>
                    item.id === 'codex' ? { ...item, models: ['gpt-5-codex', 'gpt-4.1'] } : item,
                ),
            };
            return {
                ok: true as const,
                data: { host: 'api.openai.com', models: ['gpt-5-codex', 'gpt-4.1'] },
            };
        });
        setApiGateway({
            ai: {
                // The notes list mounts with the section; none are saved here.
                listMemoryNotes: async () => ({ ok: true as const, data: [] }),
                getSettings: async () => ({ ok: true as const, data: current }),
                setSettings,
                saveKey,
                clearKey: vi.fn(),
                preview: vi.fn(),
                send: vi.fn(),
                listModels,
                // The MCP rows mount too; they stay disabled without a status.
                getMCPStatus: async () => ({
                    ok: false as const,
                    error: { message: 'unsupported' },
                }),
            },
        } as unknown as ApiGateway);

        render(<Harness />);

        expect(await screen.findByText('Codex')).toBeInTheDocument();
        expect(screen.queryByLabelText('Codex API key')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Codex' }));
        expect(await screen.findByLabelText('Codex API key')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Codex API key'), {
            target: { value: 'sk-test' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));

        expect(await screen.findByLabelText('Codex model')).toBeInTheDocument();
        expect(saveKey).toHaveBeenCalledWith('sk-test', 'api.openai.com');
        expect(listModels).toHaveBeenCalledWith('api.openai.com');
        expect(screen.getByText('gpt-5-codex')).toBeInTheDocument();
    });

    it('turns connection details on through the model, off by default', () => {
        const model: AssistantSettingsModel = {
            settings: view({ enabled: true }),
            busy: false,
            error: '',
            status: '',
            hasConnection: true,
            setEnabled: vi.fn(),
            setConnectionDisabled: vi.fn(),
            setIncludeBodies: vi.fn(),
            setIncludeConnectionDetails: vi.fn(),
            setAllowReadData: vi.fn(),
            setAllowChanges: vi.fn(),
            setAllowAudit: vi.fn(),
            setAllowProduction: vi.fn(),
            connectionId: 'conn',
            setDataMode: vi.fn(),
            dismissDataPolicyNotice: vi.fn(),
            selectProvider: vi.fn(),
            selectModel: vi.fn(),
            testKey: vi.fn(async () => true),
            clearKey: vi.fn(),
        };
        const mcp: MCPServerSettingsModel = {
            status: null,
            busy: false,
            error: '',
            message: '',
            setRunning: vi.fn(),
            setAutoStart: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            rotateToken: vi.fn(),
        };
        render(<SettingsAssistant model={model} mcp={mcp} />);

        const toggle = screen.getByRole('switch', { name: 'Include connection details' });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
        expect(model.setIncludeConnectionDetails).toHaveBeenCalledWith(true);
    });

    it('wires the agent permission switches, and disables Production until changes are on', () => {
        const model: AssistantSettingsModel = {
            settings: view({ enabled: true }),
            busy: false,
            error: '',
            status: '',
            hasConnection: true,
            setEnabled: vi.fn(),
            setConnectionDisabled: vi.fn(),
            setIncludeBodies: vi.fn(),
            setIncludeConnectionDetails: vi.fn(),
            setAllowReadData: vi.fn(),
            setAllowChanges: vi.fn(),
            setAllowAudit: vi.fn(),
            setAllowProduction: vi.fn(),
            connectionId: 'conn',
            setDataMode: vi.fn(),
            dismissDataPolicyNotice: vi.fn(),
            selectProvider: vi.fn(),
            selectModel: vi.fn(),
            testKey: vi.fn(async () => true),
            clearKey: vi.fn(),
        };
        const mcp: MCPServerSettingsModel = {
            status: null,
            busy: false,
            error: '',
            message: '',
            setRunning: vi.fn(),
            setAutoStart: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            rotateToken: vi.fn(),
        };
        const { rerender } = render(<SettingsAssistant model={model} mcp={mcp} />);

        expect(
            screen.getByRole('switch', { name: 'Allow the agent on Production' }),
        ).toBeDisabled();

        fireEvent.click(screen.getByRole('switch', { name: 'Let the agent count rows' }));
        expect(model.setAllowReadData).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('switch', { name: 'Let the agent propose changes' }));
        expect(model.setAllowChanges).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByRole('switch', { name: 'Let the agent read the run history' }));
        expect(model.setAllowAudit).toHaveBeenCalledWith(true);

        rerender(
            <SettingsAssistant
                model={{ ...model, settings: view({ enabled: true, allowChanges: true }) }}
                mcp={mcp}
            />,
        );
        const production = screen.getByRole('switch', { name: 'Allow the agent on Production' });
        expect(production).not.toBeDisabled();
        fireEvent.click(production);
        expect(model.setAllowProduction).toHaveBeenCalledWith(true);

        // Data mode is free on every plan: its switch is on whenever the panel is idle.
        const dataMode = screen.getByRole('switch', { name: 'Data mode' });
        expect(dataMode).not.toBeDisabled();
        fireEvent.click(dataMode);
        expect(model.setDataMode).toHaveBeenCalledWith(true);
        expect(screen.queryByText(/Sensitive columns/i)).toBeNull();
    });
});
