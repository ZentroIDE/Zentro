// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { kernelErrorMessage, type KernelError } from '../shared/kernel';
import { EVENT } from '../lib/events';
import { wailsEventBus, type Unsubscribe } from '../lib/eventBus';
import type {
    AIChatApproval,
    AIChatDelta,
    AIChatTool,
    AISentRound,
    AIMentionCatalog,
    AIPreview,
    AISendResult,
    AISession,
    AISensitiveMatch,
    AISessionSummary,
} from '../lib/aiAssistant';
import {
    normalizeMentions,
    normalizePreview,
    normalizeSendResult,
    normalizeSession,
    normalizeSessions,
} from '../lib/aiAssistant';

// The chat state for the assistant panel: saved sessions, the open one, the
// data review, and the reply that is still streaming. Settings live in
// aiSettingsStore. The API key never enters this store.

export interface AIPending {
    requestId: string;
    question: string;
    text: string;
    startedAt: number;
    // What the model looked up so far, in order.
    tools: { label: string; withheld: boolean }[];
    // Every request sent so far, byte for byte (ADR 0017).
    rounds: AISentRound[];
}

export interface AIHold {
    message: string;
    matches: AISensitiveMatch[];
}

interface ReviewInput {
    message: string;
    mentions: string[];
    includeBodies: boolean;
    acceptHost: boolean;
    acknowledgeSensitive: boolean;
    grant: boolean;
}

interface SendInput {
    message: string;
    mentions: string[];
    includeBodies: boolean;
    acknowledgeSensitive: boolean;
    sendToken: string;
}

interface AIChatState {
    sessions: AISessionSummary[];
    session: AISession | null;
    grants: Record<string, true>;
    review: AIPreview | null;
    pending: AIPending | null;
    hold: AIHold | null;
    // Rows the reply wants to send; it waits until the user answers.
    approval: AIChatApproval | null;
    mentions: AIMentionCatalog | null;
    notice: string;
    error: string;
    // Set when a send was refused because the approval no longer matches
    // (another model, a summary fold, object text). The input shows the
    // review again instead of an error.
    reviewNeeded: boolean;
    busy: boolean;

    loadSessions: () => Promise<void>;
    openSession: (id: string) => Promise<void>;
    newSession: () => Promise<AISession | null>;
    deleteSession: (id: string) => Promise<void>;
    renameSession: (id: string, title: string) => Promise<void>;
    loadMentions: () => Promise<void>;
    requestReview: (input: ReviewInput) => Promise<AIPreview | null>;
    send: (input: SendInput) => Promise<boolean>;
    stop: () => void;
    answerApproval: (share: boolean) => Promise<void>;
    revoke: () => Promise<void>;
    clearReview: () => void;
}

let unsubscribe: Unsubscribe | null = null;
let unsubscribeTools: Unsubscribe | null = null;
let unsubscribeRounds: Unsubscribe | null = null;
let unsubscribeApprovals: Unsubscribe | null = null;

function errorText(error: KernelError): string {
    return kernelErrorMessage(error);
}

export const useAIChatStore = create<AIChatState>()((set, get) => {
    const ensureStreaming = () => {
        if (unsubscribe) return;
        unsubscribe = wailsEventBus.on(EVENT.AI_CHAT_DELTA, (payload: unknown) => {
            const delta = payload as AIChatDelta;
            const pending = get().pending;
            if (!pending || pending.requestId !== delta.requestId) return;
            set({ pending: { ...pending, text: pending.text + delta.text } });
        });
        unsubscribeTools = wailsEventBus.on(EVENT.AI_CHAT_TOOL, (payload: unknown) => {
            const tool = payload as AIChatTool;
            const pending = get().pending;
            if (!pending || pending.requestId !== tool.requestId) return;
            set({
                pending: {
                    ...pending,
                    tools: [...pending.tools, { label: tool.label, withheld: tool.withheld }],
                },
            });
        });
        unsubscribeRounds = wailsEventBus.on(EVENT.AI_CHAT_ROUND, (payload: unknown) => {
            const round = payload as AISentRound;
            const pending = get().pending;
            if (!pending || pending.requestId !== round.requestId) return;
            set({ pending: { ...pending, rounds: [...pending.rounds, round] } });
        });
        unsubscribeApprovals = wailsEventBus.on(EVENT.AI_CHAT_APPROVAL, (payload: unknown) => {
            const approval = payload as AIChatApproval;
            const pending = get().pending;
            if (!pending || pending.requestId !== approval.requestId) return;
            set({ approval: { ...approval, results: approval.results ?? [] } });
        });
    };

    const ensureSession = async (): Promise<AISession | null> => {
        const current = get().session;
        if (current) return current;
        return get().newSession();
    };

    return {
        sessions: [],
        session: null,
        grants: {},
        review: null,
        pending: null,
        hold: null,
        approval: null,
        mentions: null,
        notice: '',
        error: '',
        reviewNeeded: false,
        busy: false,

        loadSessions: async () => {
            const response = await getApiGateway().ai.listSessions();
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return;
            }
            set({ sessions: normalizeSessions(response.data) });
        },

        openSession: async id => {
            if (get().busy) return;
            const response = await getApiGateway().ai.getSession(id);
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return;
            }
            set({
                session: normalizeSession(response.data),
                review: null,
                hold: null,
                notice: '',
                error: '',
            });
        },

        newSession: async () => {
            const response = await getApiGateway().ai.createSession();
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return null;
            }
            set({
                session: normalizeSession(response.data),
                review: null,
                hold: null,
                notice: '',
                error: '',
            });
            await get().loadSessions();
            return normalizeSession(response.data);
        },

        deleteSession: async id => {
            const response = await getApiGateway().ai.deleteSession(id);
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return;
            }
            const grants = { ...get().grants };
            delete grants[id];
            const wasOpen = get().session?.id === id;
            set({ grants, ...(wasOpen ? { session: null, review: null } : {}) });
            await get().loadSessions();
        },

        renameSession: async (id, title) => {
            const clean = title.trim();
            if (!clean) return;
            const response = await getApiGateway().ai.renameSession(id, clean);
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return;
            }
            const current = get().session;
            if (current?.id === id) set({ session: { ...current, title: clean } });
            await get().loadSessions();
        },

        loadMentions: async () => {
            const response = await getApiGateway().ai.listMentions();
            if (response.ok) set({ mentions: normalizeMentions(response.data) });
        },

        requestReview: async input => {
            const session = await ensureSession();
            if (!session) return null;
            set({ busy: true, error: '', hold: null, notice: '' });
            const response = await getApiGateway().ai.preview({
                message: input.message,
                includeBodies: input.includeBodies,
                acceptHost: input.acceptHost,
                acknowledgeSensitive: input.acknowledgeSensitive,
                refresh: false,
                sessionId: session.id,
                mentions: input.mentions,
                grantSession: input.grant,
            });
            set({ busy: false });
            if (!response.ok) {
                set({ error: errorText(response.error) });
                return null;
            }
            const preview = normalizePreview(response.data);
            const grants = { ...get().grants };
            if (preview.granted) grants[session.id] = true;
            set({ review: preview, grants });
            return preview;
        },

        send: async input => {
            const session = await ensureSession();
            if (!session) return false;
            ensureStreaming();
            const requestId = crypto.randomUUID();
            set({
                busy: true,
                error: '',
                notice: '',
                hold: null,
                review: null,
                pending: {
                    requestId,
                    question: input.message,
                    text: '',
                    startedAt: Date.now(),
                    tools: [],
                    rounds: [],
                },
            });
            const response = await getApiGateway().ai.send({
                message: input.message,
                includeBodies: input.includeBodies,
                acknowledgeSensitive: input.acknowledgeSensitive,
                sendToken: input.sendToken,
                sessionId: session.id,
                requestId,
                mentions: input.mentions,
            });
            set({ busy: false, pending: null, approval: null });
            if (!response.ok) {
                const message = errorText(response.error);
                const grants = { ...get().grants };
                if (message.includes('review the data')) {
                    delete grants[session.id];
                    set({ grants, reviewNeeded: true });
                    return false;
                }
                set({ error: message, grants });
                return false;
            }
            const result: AISendResult = normalizeSendResult(response.data);
            if (result.held && result.holdReason === 'sensitive') {
                set({ hold: { message: input.message, matches: result.matches ?? [] } });
                return false;
            }
            if (result.held) {
                set({ error: 'Allow the model host first, then send again.' });
                return false;
            }
            if (result.stopped) {
                set({ notice: 'Stopped. The partial reply was not saved.' });
                return false;
            }
            const refreshed = await getApiGateway().ai.getSession(session.id);
            if (refreshed.ok) set({ session: normalizeSession(refreshed.data) });
            await get().loadSessions();
            return true;
        },

        stop: () => {
            const pending = get().pending;
            if (!pending) return;
            set({ approval: null });
            void getApiGateway().ai.cancelChat(pending.requestId);
        },

        answerApproval: async share => {
            const approval = get().approval;
            if (!approval) return;
            set({ approval: null });
            const response = await getApiGateway().ai.resolveChatApproval(
                approval.requestId,
                share,
            );
            if (!response.ok) set({ error: errorText(response.error) });
        },

        revoke: async () => {
            const session = get().session;
            if (!session) return;
            await getApiGateway().ai.revokeDataGrant(session.id);
            const grants = { ...get().grants };
            delete grants[session.id];
            set({ grants, review: null });
        },

        clearReview: () => set({ review: null, hold: null }),
    };
});

export function isGranted(state: Pick<AIChatState, 'grants' | 'session'>): boolean {
    return Boolean(state.session && state.grants[state.session.id]);
}
