// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiGateway } from '../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../platform/apiGatewayRuntime';
import { EVENT } from '../lib/events';
import { useAIChatStore } from './aiChatStore';

type Handler = (payload: unknown) => void;
const handlers: Record<string, Handler> = {};

vi.mock('../lib/eventBus', () => ({
    wailsEventBus: {
        on: (event: string, handler: Handler) => {
            handlers[event] = handler;
            return () => undefined;
        },
        emit: () => undefined,
    },
}));

const session = {
    id: 's1',
    title: 'Chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    createdAt: '',
    updatedAt: '',
    turns: [],
};

describe('aiChatStore streaming', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({
            session: null,
            pending: null,
            grants: {},
            error: '',
            notice: '',
        });
    });

    it('adds deltas only to the request that is pending', async () => {
        let finish: (value: unknown) => void = () => undefined;
        setApiGateway({
            ai: {
                send: () =>
                    new Promise(resolve => {
                        finish = resolve;
                    }),
                getSession: async () => ({ ok: true as const, data: session }),
                listSessions: async () => ({ ok: true as const, data: [] }),
            },
        } as unknown as ApiGateway);
        useAIChatStore.setState({ session });

        const sending = useAIChatStore.getState().send({
            message: 'hi',
            mentions: [],
            includeBodies: false,
            acknowledgeSensitive: false,
            sendToken: '',
        });
        await vi.waitFor(() => expect(useAIChatStore.getState().pending).not.toBeNull());
        const requestId = useAIChatStore.getState().pending?.requestId ?? '';

        handlers[EVENT.AI_CHAT_DELTA]({ requestId: 'other', text: 'ignored' });
        handlers[EVENT.AI_CHAT_DELTA]({ requestId, text: 'Hel' });
        handlers[EVENT.AI_CHAT_DELTA]({ requestId, text: 'lo' });

        expect(useAIChatStore.getState().pending?.text).toBe('Hello');
        finish({
            ok: true,
            data: {
                reply: 'Hello',
                held: false,
                holdReason: '',
                matches: [],
                suggestions: [],
                tools: [],
                stopped: false,
            },
        });
        await sending;
        expect(useAIChatStore.getState().pending).toBeNull();
    });

    it('adds lookups only to the request that is pending', async () => {
        let finish: (value: unknown) => void = () => undefined;
        setApiGateway({
            ai: {
                send: () =>
                    new Promise(resolve => {
                        finish = resolve;
                    }),
                getSession: async () => ({ ok: true as const, data: session }),
                listSessions: async () => ({ ok: true as const, data: [] }),
            },
        } as unknown as ApiGateway);
        useAIChatStore.setState({ session });

        const sending = useAIChatStore.getState().send({
            message: 'hi',
            mentions: [],
            includeBodies: false,
            acknowledgeSensitive: false,
            sendToken: '',
        });
        await vi.waitFor(() => expect(useAIChatStore.getState().pending).not.toBeNull());
        const requestId = useAIChatStore.getState().pending?.requestId ?? '';

        handlers[EVENT.AI_CHAT_TOOL]({ requestId: 'other', label: 'ignored', withheld: false });
        handlers[EVENT.AI_CHAT_TOOL]({ requestId, label: 'Looked at orders', withheld: false });

        expect(useAIChatStore.getState().pending?.tools).toEqual([
            { label: 'Looked at orders', withheld: false },
        ]);
        finish({
            ok: true,
            data: {
                reply: 'x',
                held: false,
                holdReason: '',
                matches: [],
                suggestions: [],
                stopped: false,
            },
        });
        await sending;
    });

    it('collects rounds and an approval for the pending request, then answers it', async () => {
        let finish: (value: unknown) => void = () => undefined;
        const resolveChatApproval = vi.fn(async () => ({ ok: true as const, data: undefined }));
        setApiGateway({
            ai: {
                send: () =>
                    new Promise(resolve => {
                        finish = resolve;
                    }),
                resolveChatApproval,
                getSession: async () => ({ ok: true as const, data: session }),
                listSessions: async () => ({ ok: true as const, data: [] }),
            },
        } as unknown as ApiGateway);
        useAIChatStore.setState({ session, approval: null });

        const sending = useAIChatStore.getState().send({
            message: 'hi',
            mentions: [],
            includeBodies: false,
            acknowledgeSensitive: false,
            sendToken: '',
        });
        await vi.waitFor(() => expect(useAIChatStore.getState().pending).not.toBeNull());
        const requestId = useAIChatStore.getState().pending?.requestId ?? '';
        const round = { round: 0, host: 'h', bytes: 2, body: 'ab', carriesRows: false };
        const ask = { round: 1, host: 'h', loopback: false, env: 'dev', production: false };

        handlers[EVENT.AI_CHAT_ROUND]({ ...round, requestId: 'other' });
        handlers[EVENT.AI_CHAT_ROUND]({ ...round, requestId });
        expect(useAIChatStore.getState().pending?.rounds).toHaveLength(1);

        handlers[EVENT.AI_CHAT_APPROVAL]({ ...ask, requestId: 'other', results: [] });
        expect(useAIChatStore.getState().approval).toBeNull();
        handlers[EVENT.AI_CHAT_APPROVAL]({ ...ask, requestId, results: [] });
        expect(useAIChatStore.getState().approval?.requestId).toBe(requestId);

        await useAIChatStore.getState().answerApproval(false);
        expect(resolveChatApproval).toHaveBeenCalledWith(requestId, false);
        expect(useAIChatStore.getState().approval).toBeNull();

        finish({
            ok: true,
            data: {
                reply: 'x',
                held: false,
                holdReason: '',
                matches: [],
                suggestions: [],
                stopped: false,
            },
        });
        await sending;
    });

    it('sends the stop for the pending request id', async () => {
        const cancelChat = vi.fn(async () => ({ ok: true as const, data: undefined }));
        setApiGateway({ ai: { cancelChat } } as unknown as ApiGateway);
        useAIChatStore.setState({
            pending: {
                requestId: 'req-9',
                question: 'q',
                text: '',
                startedAt: 0,
                tools: [],
                rounds: [],
            },
        });

        useAIChatStore.getState().stop();

        expect(cancelChat).toHaveBeenCalledWith('req-9');
    });

    it('reports a stopped reply without saving a partial turn', async () => {
        setApiGateway({
            ai: {
                send: async () => ({
                    ok: true as const,
                    data: {
                        reply: '',
                        held: false,
                        holdReason: '',
                        matches: [],
                        suggestions: [],
                        tools: [],
                        stopped: true,
                    },
                }),
            },
        } as unknown as ApiGateway);
        useAIChatStore.setState({ session });

        const sent = await useAIChatStore.getState().send({
            message: 'long one',
            mentions: [],
            includeBodies: false,
            acknowledgeSensitive: false,
            sendToken: '',
        });

        expect(sent).toBe(false);
        expect(useAIChatStore.getState().notice).toContain('Stopped');
    });
});
