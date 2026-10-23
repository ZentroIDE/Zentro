// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import type { AISettingsView } from '../../lib/aiAssistant';
import { useAIChatStore } from '../../stores/aiChatStore';
import { AssistantPanel } from './AssistantPanel';

// How many times each message body was rendered.
const renders = vi.hoisted(() => new Map<string, number>());

vi.mock('./AssistantMarkdown', () => ({
    AssistantMarkdown: ({ text }: { text: string }) => {
        renders.set(text, (renders.get(text) ?? 0) + 1);
        return <div>{text}</div>;
    },
}));

vi.mock('../../lib/license/useFeatureGate', () => ({
    useFeatureGate: () => ({ canUse: () => true }),
}));

vi.mock('../../lib/eventBus', () => ({
    wailsEventBus: { on: () => () => undefined, emit: () => undefined },
}));

const settings: AISettingsView = {
    enabled: true,
    allowCloud: true,
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
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
    hasKey: true,
    acpAvailable: false,
    mcpAvailable: false,
    airgap: false,
    production: false,
    providers: [
        {
            id: 'deepseek',
            label: 'DeepSeek',
            host: 'api.deepseek.com',
            baseURL: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
            hasKey: true,
            keyHint: '',
            active: true,
            models: ['deepseek-chat'],
        },
    ],
};

const turn = (id: string, role: string, text: string) => ({
    id,
    role,
    text,
    sql: '',
    suggestions: [],
    tools: [],
    createdAt: '',
});

describe('AssistantPanel rendering', () => {
    afterEach(() => {
        resetApiGateway();
        renders.clear();
        useAIChatStore.setState({ session: null, pending: null });
    });

    function mount() {
        setApiGateway({
            ai: {
                getSettings: async () => ({ ok: true as const, data: settings }),
                listModels: async () => ({
                    ok: true as const,
                    data: { host: 'api.deepseek.com', models: ['deepseek-chat'] },
                }),
                listSessions: async () => ({ ok: true as const, data: [] }),
                listMentions: async () => ({
                    ok: true as const,
                    data: { schema: 'public', tables: [] },
                }),
            },
        } as unknown as ApiGateway);
        useAIChatStore.setState({
            session: {
                id: 's1',
                title: 'Chat',
                provider: 'deepseek',
                model: 'deepseek-chat',
                createdAt: '',
                updatedAt: '',
                turns: [turn('u1', 'user', 'question'), turn('a1', 'assistant', 'FIRST ANSWER')],
            },
        });
        return render(<AssistantPanel />);
    }

    it('does not render the saved messages again while the user types', async () => {
        mount();
        const input = await screen.findByRole('textbox', { name: 'Assistant message' });
        expect(renders.get('FIRST ANSWER')).toBe(1);

        for (const value of ['h', 'he', 'hel', 'hell', 'hello']) {
            fireEvent.change(input, { target: { value } });
        }

        expect(input).toHaveValue('hello');
        expect(renders.get('FIRST ANSWER')).toBe(1);
    });

    it('renders only the reply that is streaming, not the saved ones', async () => {
        mount();
        await screen.findByRole('textbox', { name: 'Assistant message' });

        act(() => {
            useAIChatStore.setState({
                pending: {
                    requestId: 'r1',
                    question: 'next',
                    text: 'part',
                    startedAt: 0,
                    tools: [],
                    rounds: [],
                },
            });
        });
        act(() => {
            useAIChatStore.setState({
                pending: {
                    requestId: 'r1',
                    question: 'next',
                    text: 'part two',
                    startedAt: 0,
                    tools: [],
                    rounds: [],
                },
            });
        });

        expect(renders.get('part two')).toBe(1);
        expect(renders.get('FIRST ANSWER')).toBe(1);
    });
});
