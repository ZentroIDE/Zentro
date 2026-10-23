// SPDX-License-Identifier: GPL-3.0-only

import { formatMessageTime } from './aiTime';

// questionNav finds a question of the open chat in the page and scrolls to it.
// Each question's section carries its turn id (AssistantMessages), so the
// question list and the keyboard shortcut need no ref to the message list.

export interface QuestionItem {
    id: string;
    text: string;
    time: string;
}

// questionItems lists the questions of a chat, oldest first, with the one
// still being answered last.
export function questionItems(
    turns: { id: string; role: string; text: string; createdAt: string }[] | undefined,
    pending: { question: string; startedAt: number } | null,
): QuestionItem[] {
    const items = (turns ?? [])
        .filter(turn => turn.role === 'user')
        .map(turn => ({
            id: turn.id,
            text: turn.text,
            time: formatMessageTime(turn.createdAt),
        }));
    if (pending) {
        items.push({
            id: 'pending',
            text: pending.question,
            time: formatMessageTime(new Date(pending.startedAt).toISOString()),
        });
    }
    return items;
}

export function scrollToQuestion(id: string): void {
    const target = document.querySelector<HTMLElement>(`[data-user-turn="${CSS.escape(id)}"]`);
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// currentQuestionIndex is the last question whose top has reached the top of
// the chat, which is the one pinned there while its answer is read.
export function currentQuestionIndex(items: QuestionItem[]): number {
    let current = 0;
    items.forEach((item, index) => {
        const el = document.querySelector<HTMLElement>(`[data-user-turn="${CSS.escape(item.id)}"]`);
        const viewport = el?.closest<HTMLElement>('[data-radix-scroll-area-viewport]');
        if (!el || !viewport) return;
        if (el.getBoundingClientRect().top - viewport.getBoundingClientRect().top <= 8) {
            current = index;
        }
    });
    return current;
}

// stepQuestion moves one question up (-1) or down (+1) from the current one.
export function stepQuestion(items: QuestionItem[], direction: -1 | 1): void {
    if (items.length === 0) return;
    const next = Math.min(items.length - 1, Math.max(0, currentQuestionIndex(items) + direction));
    scrollToQuestion(items[next].id);
}
