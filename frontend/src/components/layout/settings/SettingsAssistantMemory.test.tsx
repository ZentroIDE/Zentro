// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../../platform/apiGatewayRuntime';
import type { AIMemoryNote } from '../../../lib/aiAssistant';
import { SettingsAssistantMemory } from './SettingsAssistantMemory';

function note(id: string, text: string, source = 'agent'): AIMemoryNote {
    return { id, text, source, createdAt: '2026-10-13T00:00:00Z' };
}

function installGateway(initial: AIMemoryNote[]) {
    let notes = initial;
    const ai = {
        listMemoryNotes: vi.fn(async () => ({ ok: true as const, data: notes })),
        addMemoryNote: vi.fn(async (text: string) => {
            const created = note(`note-${notes.length}`, text, 'user');
            notes = [...notes, created];
            return { ok: true as const, data: created };
        }),
        deleteMemoryNote: vi.fn(async (id: string) => {
            notes = notes.filter(item => item.id !== id);
            return { ok: true as const, data: undefined };
        }),
    };
    setApiGateway({ ai } as unknown as ApiGateway);
    return ai;
}

const manyNotes = (count: number) =>
    Array.from({ length: count }, (_, i) => note(`n${i}`, `fact number ${i}`));

describe('SettingsAssistantMemory', () => {
    afterEach(() => resetApiGateway());

    it('is folded by default and says how many notes there are and who wrote them', async () => {
        installGateway([note('a', 'status 3 means shipped'), note('b', 'typed by me', 'user')]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        expect(
            await screen.findByText(/2 saved for this connection, 1 written by/),
        ).toBeInTheDocument();
        expect(screen.queryByText('status 3 means shipped')).toBeNull();
        fireEvent.click(await screen.findByRole('button', { name: 'Show 2' }));
        expect(screen.getByText('status 3 means shipped')).toBeInTheDocument();
    });

    it('marks only the notes a person wrote', async () => {
        installGateway([note('a', 'by the assistant'), note('b', 'typed by me', 'user')]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Show 2' }));
        expect(screen.getAllByText('You')).toHaveLength(1);
        expect(screen.queryByText('Assistant')).toBeNull();
    });

    it('shows five notes first and the rest on request', async () => {
        installGateway(manyNotes(8));
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Show 8' }));
        expect(screen.getByText('fact number 4')).toBeInTheDocument();
        expect(screen.queryByText('fact number 5')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
        expect(screen.getByText('fact number 7')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
        expect(screen.queryByText('fact number 7')).toBeNull();
    });

    it('adds a note on the same line as its field, and clears the field', async () => {
        const ai = installGateway([]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add one' }));
        fireEvent.change(screen.getByLabelText('New assistant note'), {
            target: { value: 'orders join customers on customer_id' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
        expect(await screen.findByText('orders join customers on customer_id')).toBeInTheDocument();
        expect(ai.addMemoryNote).toHaveBeenCalledWith('orders join customers on customer_id');
        await waitFor(() => expect(screen.getByLabelText('New assistant note')).toHaveValue(''));
    });

    it('saves a note when Enter is pressed in the field', async () => {
        const ai = installGateway([]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add one' }));
        const field = screen.getByLabelText('New assistant note');
        fireEvent.change(field, { target: { value: 'quick note' } });
        fireEvent.keyDown(field, { key: 'Enter' });
        await waitFor(() => expect(ai.addMemoryNote).toHaveBeenCalledWith('quick note'));
    });

    it('keeps Shift+Enter for a new line and does not save on it', async () => {
        const ai = installGateway([]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add one' }));
        const field = screen.getByLabelText('New assistant note');
        expect(field.tagName).toBe('TEXTAREA');
        fireEvent.change(field, { target: { value: 'two lines' } });
        fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
        expect(ai.addMemoryNote).not.toHaveBeenCalled();
    });

    it('hides the delete button until the row is hovered or focused, but keeps it reachable', async () => {
        installGateway([note('a', 'a note')]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Show 1' }));
        const remove = screen.getByRole('button', { name: 'Delete note: a note' });
        expect(remove).toHaveClass('opacity-0');
        expect(remove).toHaveClass('group-hover:opacity-100');
        expect(remove).toHaveClass('group-focus-within:opacity-100');
        expect(remove).toHaveClass('focus-visible:opacity-100');
        expect(remove.closest('li')).toHaveClass('group');
        // It is laid over the row, so it takes no width from the note text.
        expect(remove).toHaveClass('absolute');
    });

    it('asks before deleting, and deletes only on yes', async () => {
        const ai = installGateway([note('a', 'wrong note')]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Show 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete note: wrong note' }));

        // The trash button asked; nothing is deleted yet.
        expect(screen.getByText('Delete?')).toBeInTheDocument();
        expect(ai.deleteMemoryNote).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTitle('Delete this note'));
        await waitFor(() => expect(screen.queryByText('wrong note')).toBeNull());
        expect(ai.deleteMemoryNote).toHaveBeenCalledWith('a');
    });

    it('keeps the note when the question is answered no', async () => {
        const ai = installGateway([note('a', 'keep me')]);
        render(<SettingsAssistantMemory connectionId='conn' />);
        fireEvent.click(await screen.findByRole('button', { name: 'Show 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete note: keep me' }));
        fireEvent.click(screen.getByTitle('Keep it'));
        expect(screen.queryByText('Delete?')).toBeNull();
        expect(screen.getByText('keep me')).toBeInTheDocument();
        expect(ai.deleteMemoryNote).not.toHaveBeenCalled();
    });

    it('does not call the backend without a connection', () => {
        const ai = installGateway([]);
        render(<SettingsAssistantMemory connectionId='' />);
        expect(ai.listMemoryNotes).not.toHaveBeenCalled();
        expect(screen.getByText('Connect to a database to see its notes.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add one' })).toBeDisabled();
    });
});

describe('SettingsAssistantMemory when the backend call fails', () => {
    afterEach(() => resetApiGateway());

    it('shows the error', async () => {
        setApiGateway({
            ai: {
                listMemoryNotes: vi.fn(async () => ({
                    ok: false as const,
                    error: { code: 'x', message: 'ListAIMemoryNotes is not a function' },
                })),
            },
        } as unknown as ApiGateway);
        render(<SettingsAssistantMemory connectionId='conn' />);
        expect(await screen.findByText(/ListAIMemoryNotes is not a function/)).toBeInTheDocument();
    });
});
