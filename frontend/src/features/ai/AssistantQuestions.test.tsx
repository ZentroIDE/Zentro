// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantQuestions } from './AssistantQuestions';
import { AssistantTokenBar } from './AssistantComposer';
import { stepQuestion, type QuestionItem } from '../../lib/aiQuestionNav';
import { formatDuration } from '../../lib/aiTime';

const items: QuestionItem[] = [
    { id: 'a', text: 'first question', time: '10:00' },
    { id: 'b', text: 'second question', time: '10:05' },
    { id: 'c', text: 'third question', time: '10:09' },
];

function mountSections() {
    document.body.innerHTML = items
        .map(
            item =>
                `<div data-radix-scroll-area-viewport><section data-user-turn="${item.id}"></section></div>`,
        )
        .join('');
    const scrolled: string[] = [];
    document.querySelectorAll<HTMLElement>('[data-user-turn]').forEach(el => {
        el.scrollIntoView = vi.fn(() => scrolled.push(el.dataset.userTurn ?? ''));
    });
    return scrolled;
}

describe('AssistantQuestions', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('lists the questions with their times and scrolls to the one picked', () => {
        const scrolled = mountSections();
        const host = document.createElement('div');
        document.body.appendChild(host);
        render(<AssistantQuestions items={items} />, { container: host });
        fireEvent.click(screen.getByRole('button', { name: /Questions in this chat \(3\)/ }));
        expect(screen.getByText('10:05')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /second question/ }));
        expect(scrolled).toEqual(['b']);
    });

    it('is hidden for a short chat', () => {
        const { container } = render(<AssistantQuestions items={items.slice(0, 2)} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('steps to the next question from the one at the top', () => {
        const scrolled = mountSections();
        stepQuestion(items, 1);
        expect(scrolled).toHaveLength(1);
    });
});

describe('formatDuration', () => {
    it('reads seconds under a minute and whole minutes above, rounded up', () => {
        expect(formatDuration(0)).toBe('');
        expect(formatDuration(400)).toBe('1s');
        expect(formatDuration(42_100)).toBe('43s');
        expect(formatDuration(60_000)).toBe('1 min');
        expect(formatDuration(75_000)).toBe('2 min');
    });
});

describe('AssistantTokenBar', () => {
    it('shows how much of the input was billed as cached', () => {
        render(<AssistantTokenBar total={{ input: 1000, output: 200, cached: 600 }} />);
        expect(screen.getByText(/1.2k tokens · 60% cached/)).toBeInTheDocument();
    });

    it('keeps the chat controls on the left even before the first reply', () => {
        render(
            <AssistantTokenBar
                total={{ input: 0, output: 0, cached: 0 }}
                left={<span>controls</span>}
            />,
        );
        expect(screen.getByText('controls')).toBeInTheDocument();
    });
});
