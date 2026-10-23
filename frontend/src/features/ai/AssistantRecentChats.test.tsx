// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantRecentChats, recentChats } from './AssistantRecentChats';
import type { AISessionSummary } from '../../lib/aiAssistant';

function chat(id: string, updatedAt: string, turnCount = 4): AISessionSummary {
    return { id, title: `chat ${id}`, model: 'deepseek-flash', updatedAt, turnCount };
}

describe('recentChats', () => {
    it('takes the three newest chats with messages, not the open one', () => {
        const sessions = [
            chat('old', '2026-10-01T00:00:00Z'),
            chat('a', '2026-10-14T00:00:00Z'),
            chat('empty', '2026-10-15T00:00:00Z', 0),
            chat('open', '2026-10-15T01:00:00Z'),
            chat('b', '2026-10-13T00:00:00Z'),
            chat('c', '2026-10-12T00:00:00Z'),
        ];
        expect(recentChats(sessions, 'open').map(item => item.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('AssistantRecentChats', () => {
    it('lists chats and opens the one clicked', () => {
        const onOpen = vi.fn();
        render(
            <AssistantRecentChats
                sessions={[chat('a', '2026-10-14T00:00:00Z'), chat('b', '2026-10-13T00:00:00Z')]}
                onOpen={onOpen}
            />,
        );
        expect(screen.getByText('Continue a chat')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /chat b/ }));
        expect(onOpen).toHaveBeenCalledWith('b');
    });

    it('shows nothing without earlier chats', () => {
        const { container } = render(<AssistantRecentChats sessions={[]} onOpen={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
