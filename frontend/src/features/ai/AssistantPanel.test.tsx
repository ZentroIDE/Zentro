// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import type { AISettingsView } from '../../lib/aiAssistant';
import { useAIChatStore } from '../../stores/aiChatStore';
import { AssistantPanel } from './AssistantPanel';

vi.mock('../../lib/eventBus', () => ({
    wailsEventBus: { on: () => () => undefined, emit: () => undefined },
}));

vi.mock('../../lib/license/useFeatureGate', () => ({
    useFeatureGate: () => ({
        canUse: () => true,
    }),
}));

function view(overrides: Partial<AISettingsView> = {}): AISettingsView {
    return {
        enabled: true,
        allowCloud: true,
        baseURL: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        allowedHosts: ['api.deepseek.com'],
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

const emptySession = {
    id: 's1',
    title: 'New chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    createdAt: '',
    updatedAt: '',
    turns: [],
};

function gatewayWith(overrides: Record<string, unknown>) {
    const base = {
        getSettings: async () => ({ ok: true as const, data: view() }),
        setSettings: vi.fn(),
        saveKey: vi.fn(),
        clearKey: vi.fn(),
        preview: vi.fn(),
        send: vi.fn(),
        listModels: async () => ({
            ok: true as const,
            data: { host: 'api.deepseek.com', models: ['deepseek-chat'] },
        }),
        listMentions: async () => ({ ok: true as const, data: { schema: 'public', tables: [] } }),
        cancelChat: vi.fn(),
        revokeDataGrant: vi.fn(),
        createSession: async () => ({ ok: true as const, data: emptySession }),
        listSessions: async () => ({ ok: true as const, data: [] }),
        getSession: async () => ({ ok: true as const, data: emptySession }),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
    };
    return { ...base, ...overrides };
}

const reply = (text: string) => ({
    ok: true as const,
    data: {
        reply: text,
        sql: '',
        risk: '',
        held: false,
        holdReason: '',
        matches: [],
        suggestions: [],
        tools: [],
        usage: null,
        estimatedTokens: 3,
        stopped: false,
    },
});

describe('AssistantPanel', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({
            session: null,
            sessions: [],
            grants: {},
            review: null,
            pending: null,
            hold: null,
            error: '',
            notice: '',
            busy: false,
        });
    });

    it('reviews the data once, then sends the reviewed body', async () => {
        const preview = vi.fn(async () => ({
            ok: true as const,
            data: {
                host: 'api.deepseek.com',
                model: 'deepseek-chat',
                body: '{"model":"deepseek-chat","messages":[]}',
                data: 'schema: public\ntable orders',
                estimatedTokens: 12,
                historyTurns: 0,
                sendToken: 'token-1',
                held: false,
                holdReason: '',
                matches: [],
                loopback: false,
                granted: false,
            },
        }));
        const send = vi.fn(async () => reply('use orders'));
        const withTurns = {
            ...emptySession,
            turns: [
                {
                    id: 'u',
                    role: 'user',
                    text: 'list orders',
                    sql: '',
                    suggestions: [],
                    tools: [],
                    usage: null,
                    createdAt: '',
                },
                {
                    id: 'a',
                    role: 'assistant',
                    text: 'use orders',
                    sql: '',
                    suggestions: [],
                    tools: [],
                    usage: null,
                    createdAt: '',
                },
            ],
        };
        setApiGateway({
            ai: gatewayWith({
                preview,
                send,
                getSession: async () => ({ ok: true as const, data: withTurns }),
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);

        fireEvent.change(await screen.findByRole('textbox', { name: 'Assistant message' }), {
            target: { value: 'list orders' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() =>
            expect(
                screen.getByText(/can look up the structure of this database/),
            ).toBeInTheDocument(),
        );
        expect(preview).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'list orders', grantSession: false }),
        );

        fireEvent.click(await screen.findByRole('button', { name: 'View data' }));
        expect(await screen.findByRole('textbox', { name: 'Payload preview' })).toHaveValue(
            'schema: public\ntable orders',
        );

        // While the review waits, the Send button is Cancel; the notice sends.
        expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Allow for this chat' }));
        await waitFor(() => expect(screen.getByText('use orders')).toBeInTheDocument());
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ sendToken: 'token-1' }));
    });

    it('with send-without-review on, Send anyway sends without a review', async () => {
        const preview = vi.fn();
        const send = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true as const,
                data: {
                    ...reply('').data,
                    held: true,
                    holdReason: 'sensitive',
                    matches: [
                        {
                            type: 'phone',
                            sample: '091...78',
                            where: 'your message',
                            context: 'call 0912 345 678',
                        },
                    ],
                },
            })
            .mockResolvedValueOnce(reply('sent'));
        setApiGateway({
            ai: gatewayWith({
                getSettings: async () => ({ ok: true as const, data: view({ autoApprove: true }) }),
                preview,
                send,
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);
        fireEvent.change(await screen.findByRole('textbox', { name: 'Assistant message' }), {
            target: { value: 'call 0912 345 678' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Send anyway' }));

        await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        expect(send).toHaveBeenLastCalledWith(
            expect.objectContaining({ acknowledgeSensitive: true, sendToken: '' }),
        );
        expect(preview).not.toHaveBeenCalled();
    });

    it('shows the review again when an approval no longer matches, and keeps the text', async () => {
        const preview = vi.fn(async () => ({
            ok: true as const,
            data: {
                host: 'api.deepseek.com',
                model: 'deepseek-chat',
                body: '{}',
                data: 'schema: public',
                estimatedTokens: 1,
                historyTurns: 0,
                sendToken: 'token-2',
                held: false,
                holdReason: '',
                matches: [],
                loopback: false,
                granted: false,
            },
        }));
        const send = vi.fn(async () => ({
            ok: false as const,
            error: { code: 'x', message: 'review the data before sending' },
        }));
        setApiGateway({
            ai: gatewayWith({
                getSettings: async () => ({ ok: true as const, data: view({ autoApprove: true }) }),
                preview,
                send,
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);
        const box = await screen.findByRole('textbox', { name: 'Assistant message' });
        fireEvent.change(box, { target: { value: 'top suppliers' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() => expect(preview).toHaveBeenCalled());
        expect(
            await screen.findByText(/can look up the structure of this database/),
        ).toBeInTheDocument();
        expect(screen.queryByText('review the data before sending')).toBeNull();
        expect(box).toHaveValue('top suppliers');
    });

    it('cancels a waiting review without sending', async () => {
        const preview = vi.fn(async () => ({
            ok: true as const,
            data: {
                host: 'api.deepseek.com',
                model: 'deepseek-chat',
                body: '{}',
                data: 'schema: public',
                estimatedTokens: 1,
                historyTurns: 0,
                sendToken: 'token-1',
                held: false,
                holdReason: '',
                matches: [],
                loopback: false,
                granted: false,
            },
        }));
        const send = vi.fn();
        setApiGateway({
            ai: gatewayWith({ preview, send }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);
        fireEvent.change(await screen.findByRole('textbox', { name: 'Assistant message' }), {
            target: { value: 'list orders' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

        await waitFor(() =>
            expect(screen.queryByText(/can look up the structure of this database/)).toBeNull(),
        );
        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
        expect(send).not.toHaveBeenCalled();
    });

    it('sends straight through when the chat holds an approval', async () => {
        const preview = vi.fn();
        const send = vi.fn(async () => reply('no review needed'));
        const withTurns = {
            ...emptySession,
            turns: [
                {
                    id: 'u',
                    role: 'user',
                    text: 'again',
                    sql: '',
                    suggestions: [],
                    tools: [],
                    usage: null,
                    createdAt: '',
                },
                {
                    id: 'a',
                    role: 'assistant',
                    text: 'no review needed',
                    sql: '',
                    suggestions: [],
                    tools: [],
                    usage: null,
                    createdAt: '',
                },
            ],
        };
        setApiGateway({
            ai: gatewayWith({
                preview,
                send,
                getSession: async () => ({ ok: true as const, data: withTurns }),
            }),
        } as unknown as ApiGateway);
        useAIChatStore.setState({ session: emptySession, grants: { s1: true } });

        render(<AssistantPanel />);

        fireEvent.change(await screen.findByRole('textbox', { name: 'Assistant message' }), {
            target: { value: 'again' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        await waitFor(() => expect(screen.getByText('no review needed')).toBeInTheDocument());
        expect(preview).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ sendToken: '' }));
    });

    it('switches the model from the chat panel and keeps the provider', async () => {
        const active = view({
            providers: view().providers.map(item =>
                item.id === 'deepseek'
                    ? { ...item, models: ['deepseek-chat', 'deepseek-reasoner'] }
                    : item,
            ),
        });
        const setSettings = vi.fn(async (next: { model: string; baseURL: string }) => ({
            ok: true as const,
            data: { ...active, model: next.model },
        }));
        setApiGateway({
            ai: gatewayWith({
                getSettings: async () => ({ ok: true as const, data: active }),
                setSettings,
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);

        fireEvent.click(await screen.findByRole('combobox', { name: 'Chat model' }));
        fireEvent.click(await screen.findByRole('option', { name: 'deepseek-reasoner' }));

        expect(setSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'deepseek-reasoner',
                baseURL: 'https://api.deepseek.com/v1',
            }),
        );
    });

    it('lets the chat panel choose Codex or DeepSeek', async () => {
        const setSettings = vi.fn(async (next: { baseURL: string; model: string }) => ({
            ok: true as const,
            data: view({
                enabled: true,
                allowCloud: true,
                baseURL: next.baseURL,
                model: next.model,
                hasKey: false,
                keyHint: '',
                providers: view().providers.map(item => ({
                    ...item,
                    hasKey: false,
                    keyHint: '',
                    active: item.baseURL === next.baseURL,
                })),
            }),
        }));
        setApiGateway({
            ai: gatewayWith({
                getSettings: async () => ({
                    ok: true as const,
                    data: view({
                        enabled: false,
                        allowCloud: false,
                        baseURL: '',
                        model: '',
                        hasKey: false,
                        keyHint: '',
                        providers: view().providers.map(item => ({
                            ...item,
                            hasKey: false,
                            keyHint: '',
                            active: false,
                            models: [],
                        })),
                    }),
                }),
                setSettings,
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);

        fireEvent.click(await screen.findByRole('button', { name: 'Codex' }));

        expect(setSettings).toHaveBeenCalledWith({
            enabled: true,
            allowCloud: true,
            baseURL: 'https://api.openai.com/v1/responses',
            model: 'gpt-5-codex',
            allowedHosts: ['api.deepseek.com'],
            disabledConnectionIDs: [],
            includeBodies: false,
            includeConnectionDetails: false,
            allowReadData: false,
            allowChanges: false,
            allowAudit: false,
            allowProduction: false,
            dataMode: false,
            autoApprove: false,
        });
        expect(
            await screen.findByText('Open chat setup to add the Codex key and test it.'),
        ).toBeInTheDocument();
    });
});

describe('AssistantPanel mention list', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({
            session: null,
            mentions: null,
            review: null,
            pending: null,
            hold: null,
        });
    });

    it('opens on the first item and moves the selection with the arrow keys', async () => {
        setApiGateway({
            ai: gatewayWith({
                listMentions: async () => ({
                    ok: true as const,
                    data: { schema: 'public', tables: [{ name: 'orders', columns: ['status'] }] },
                }),
            }),
        } as unknown as ApiGateway);

        useAIChatStore.setState({
            mentions: { schema: 'public', tables: [{ name: 'orders', columns: ['status'] }] },
        });
        render(<AssistantPanel />);

        const input = await screen.findByRole('textbox', { name: 'Assistant message' });
        fireEvent.change(input, { target: { value: '@', selectionStart: 1 } });
        (input as HTMLTextAreaElement).setSelectionRange(1, 1);

        const options = await screen.findAllByRole('option');
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        expect(options[0]).toHaveTextContent('public');
        expect(options[0]).not.toHaveTextContent('@');

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
        expect(input).toHaveAttribute('aria-activedescendant', 'assistant-mention-1');

        fireEvent.keyDown(input, { key: 'Enter' });
        expect(input).toHaveValue('@orders ');
    });
});

describe('AssistantPanel history', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, sessions: [] });
    });

    it('shows saved chats with last-modified only after the history button opens', async () => {
        const updatedAt = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        setApiGateway({
            ai: gatewayWith({
                listSessions: async () => ({
                    ok: true as const,
                    data: [
                        {
                            id: 'old',
                            title: 'Old chat',
                            model: 'deepseek-chat',
                            updatedAt,
                            turnCount: 2,
                        },
                    ],
                }),
            }),
        } as unknown as ApiGateway);

        useAIChatStore.setState({
            sessions: [
                { id: 'old', title: 'Old chat', model: 'deepseek-chat', updatedAt, turnCount: 2 },
            ],
        });
        render(<AssistantPanel />);
        // An empty chat offers its last chats right away; the history popover
        // is closed, so this is the only place the chat shows.
        expect(screen.getAllByText('Old chat')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('Old chat')).toBeInTheDocument();
        expect(within(popover).getByText('4h')).toBeInTheDocument();
    });
});

describe('AssistantPanel consent and time', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, grants: {}, review: null, pending: null });
    });

    it('allows the chat from the notice, sends once, and keeps the approval', async () => {
        const preview = vi.fn(async (request: { grantSession: boolean }) => ({
            ok: true as const,
            data: {
                host: 'api.deepseek.com',
                model: 'deepseek-chat',
                body: '{}',
                data: 'schema',
                estimatedTokens: 5,
                historyTurns: 0,
                sendToken: 'token-9',
                held: false,
                holdReason: '',
                matches: [],
                loopback: false,
                granted: request.grantSession,
            },
        }));
        const send = vi.fn(async () => reply('done'));
        setApiGateway({ ai: gatewayWith({ preview, send }) } as unknown as ApiGateway);

        render(<AssistantPanel />);
        fireEvent.change(await screen.findByRole('textbox', { name: 'Assistant message' }), {
            target: { value: 'hello' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Allow for this chat' }));

        await waitFor(() => expect(send).toHaveBeenCalled());
        expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ grantSession: true }));
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ sendToken: 'token-9' }));
        expect(useAIChatStore.getState().grants['s1']).toBe(true);
    });

    it('shows the time under a message the user sent', async () => {
        const createdAt = new Date(2026, 9, 5, 14, 32).toISOString();
        const session = {
            ...emptySession,
            turns: [
                {
                    id: 'u',
                    role: 'user',
                    text: 'hi',
                    sql: '',
                    suggestions: [],
                    tools: [],

                    createdAt,
                },
            ],
        };
        setApiGateway({ ai: gatewayWith({}) } as unknown as ApiGateway);
        useAIChatStore.setState({ session });

        render(<AssistantPanel />);

        const question = await screen.findByText('hi');
        // Each question sticks to the top of the chat while its answer scrolls.
        expect(question.closest('section')?.firstElementChild).toHaveClass('sticky');
        expect(screen.getByText(/14:32/)).toBeInTheDocument();
    });
});

describe('AssistantPanel Enter key', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, grants: {}, review: null, pending: null });
    });

    async function setup() {
        const send = vi.fn(async () => reply('ok'));
        setApiGateway({ ai: gatewayWith({ send }) } as unknown as ApiGateway);
        useAIChatStore.setState({ session: emptySession, grants: { s1: true } });
        render(<AssistantPanel />);
        const input = await screen.findByRole('textbox', { name: 'Assistant message' });
        fireEvent.change(input, { target: { value: 'hello' } });
        return { send, input };
    }

    it('sends on Enter', async () => {
        const { send, input } = await setup();
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    });

    it('keeps Shift+Enter for a new line', async () => {
        const { send, input } = await setup();
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        expect(send).not.toHaveBeenCalled();
    });

    it('does not send while an IME composition is open', async () => {
        const { send, input } = await setup();
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
        expect(send).not.toHaveBeenCalled();
    });
});

describe('AssistantPanel history list', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, sessions: [] });
    });

    const items = [
        {
            id: 'a',
            title: 'Payroll snapshots',
            model: 'deepseek-chat',
            updatedAt: new Date().toISOString(),
            turnCount: 4,
        },
        {
            id: 'b',
            title: 'Index on orders',
            model: 'deepseek-flash',
            updatedAt: new Date().toISOString(),
            turnCount: 2,
        },
    ];

    it('filters chats by the search text and shows a line about each', async () => {
        setApiGateway({ ai: gatewayWith({}) } as unknown as ApiGateway);
        useAIChatStore.setState({ sessions: items });
        render(<AssistantPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('4 messages · deepseek-chat')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
            target: { value: 'index' },
        });
        expect(within(popover).queryByText('Payroll snapshots')).toBeNull();
        expect(within(popover).getByText('Index on orders')).toBeInTheDocument();
    });

    it('asks once inside the row before it deletes a chat', async () => {
        const deleteSession = vi.fn(async () => ({ ok: true as const, data: undefined }));
        setApiGateway({ ai: gatewayWith({ deleteSession }) } as unknown as ApiGateway);
        useAIChatStore.setState({ sessions: items });
        render(<AssistantPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Index on orders' }));
        expect(deleteSession).not.toHaveBeenCalled();
        expect(screen.getByText('Delete this chat?')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(deleteSession).toHaveBeenCalledWith('b'));
    });

    it('keeps rename and delete out of the row flow and renames through them', async () => {
        const renameSession = vi.fn(async () => ({ ok: true as const, data: undefined }));
        setApiGateway({ ai: gatewayWith({ renameSession }) } as unknown as ApiGateway);
        useAIChatStore.setState({ sessions: items });
        render(<AssistantPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
        const rename = await screen.findByRole('button', { name: 'Rename Index on orders' });
        expect(rename.parentElement).toHaveClass('absolute');

        fireEvent.click(rename);
        const input = await screen.findByRole('textbox', { name: 'Chat title' });
        fireEvent.change(input, { target: { value: 'Orders indexes' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(renameSession).toHaveBeenCalledWith('b', 'Orders indexes'));
    });

    it('starts a new chat from the history list', async () => {
        const createSession = vi.fn(async () => ({ ok: true as const, data: emptySession }));
        setApiGateway({ ai: gatewayWith({ createSession }) } as unknown as ApiGateway);
        useAIChatStore.setState({ sessions: items });
        render(<AssistantPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'New chat' }));
        await waitFor(() => expect(createSession).toHaveBeenCalled());
    });
});

describe('AssistantPanel null lists from the backend', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, sessions: [] });
    });

    // Go marshals a nil slice as null. A reply with no follow-up questions is saved that way.
    it('shows a reply whose suggestions came back as null', async () => {
        const withNulls = {
            ...emptySession,
            turns: [
                { id: 'u', role: 'user', text: 'hi', sql: '', suggestions: null, createdAt: '' },
                {
                    id: 'a',
                    role: 'assistant',
                    text: 'plain answer',
                    sql: '',
                    suggestions: null,
                    createdAt: '',
                },
            ],
        };
        setApiGateway({
            ai: gatewayWith({ getSession: async () => ({ ok: true as const, data: withNulls }) }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);
        await act(async () => {
            await useAIChatStore.getState().openSession('s1');
        });

        expect(await screen.findByText('plain answer')).toBeInTheDocument();
    });

    it('treats a null chat list as empty', async () => {
        setApiGateway({
            ai: gatewayWith({ listSessions: async () => ({ ok: true as const, data: null }) }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);
        await act(async () => {
            await useAIChatStore.getState().loadSessions();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));

        expect(await screen.findByText('No saved chats yet.')).toBeInTheDocument();
    });
});

describe('AssistantPanel reply markup', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, pending: null });
    });

    it('never shows tool-call markup that a reply kept', async () => {
        const reply =
            'Bảng này lưu lịch ca.\n\n< | DSML | invoke name="suggestions">["Câu một"]</ | DSML | invoke>';
        setApiGateway({ ai: gatewayWith({}) } as unknown as ApiGateway);
        useAIChatStore.setState({
            session: {
                ...emptySession,
                turns: [
                    {
                        id: 'a',
                        role: 'assistant',
                        text: reply,
                        sql: '',
                        suggestions: [],
                        tools: [],
                        createdAt: '',
                    },
                ],
            },
        });

        render(<AssistantPanel />);

        expect(await screen.findByText('Bảng này lưu lịch ca.')).toBeInTheDocument();
        expect(screen.queryByText(/DSML/)).toBeNull();
    });

    it('hides markup in a reply that is still streaming', async () => {
        setApiGateway({ ai: gatewayWith({}) } as unknown as ApiGateway);
        useAIChatStore.setState({
            session: emptySession,
            pending: {
                requestId: 'r',
                question: 'q',
                text: 'Partial answer.\n<｜DSML｜function_calls>',
                startedAt: 0,
                tools: [],
                rounds: [],
            },
        });

        render(<AssistantPanel />);

        expect(await screen.findByText('Partial answer.')).toBeInTheDocument();
        expect(screen.queryByText(/DSML/)).toBeNull();
    });
});

describe('AssistantPanel with a key but no model', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null });
    });

    it('tells the user to load the models instead of assuming one', async () => {
        const noModel = view({ model: '' });
        setApiGateway({
            ai: gatewayWith({
                getSettings: async () => ({ ok: true as const, data: noModel }),
                listModels: async () => ({ ok: true as const, data: { host: 'x', models: [] } }),
            }),
        } as unknown as ApiGateway);

        render(<AssistantPanel />);

        expect(
            await screen.findByText('Open chat setup and press Test to load the models.'),
        ).toBeInTheDocument();
    });
});

describe('AssistantPanel lookups', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ session: null, pending: null });
    });

    it('lists what the model looked up, while it answers and once saved', async () => {
        setApiGateway({ ai: gatewayWith({}) } as unknown as ApiGateway);
        useAIChatStore.setState({
            session: {
                ...emptySession,
                turns: [
                    {
                        id: 'a',
                        role: 'assistant',
                        text: 'Use orders.status.',
                        sql: '',
                        suggestions: [],
                        tools: ['Searched for "order"', 'Looked at orders'],
                        createdAt: '',
                    },
                ],
            },
            pending: {
                requestId: 'r',
                question: 'and customers?',
                text: '',
                startedAt: 0,
                tools: [{ label: 'Looked at customers', withheld: false }],
                rounds: [],
            },
        });

        render(<AssistantPanel />);

        expect(await screen.findByText('Looked at orders')).toBeInTheDocument();
        expect(screen.getByText('Searched for "order"')).toBeInTheDocument();
        expect(screen.getByText('Looked at customers')).toBeInTheDocument();
    });
});
