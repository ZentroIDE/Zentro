// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge, Button, InlineConfirm, Textarea } from '../../ui';
import { SettingAction, SettingField, SettingGroupTitle } from './SettingItem';
import { useAssistantMemory } from './useAssistantMemory';

type Props = {
    connectionId: string;
};

// A few notes are enough to see what is kept; the rest sit behind a button.
const PREVIEW_COUNT = 5;

// SettingsAssistantMemory shows what the assistant remembers about the open
// connection. The list is folded by default: a long run of notes would push the
// settings people change every day out of view. Notes the assistant wrote are
// the norm and are said once in the summary; only a note a person typed is
// marked, so the mark carries information.
export function SettingsAssistantMemory({ connectionId }: Props) {
    const memory = useAssistantMemory(connectionId);
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [draft, setDraft] = useState('');
    // The note waiting for a yes before it is deleted. A note is gone for good
    // once deleted, so the button only asks; the check mark does the delete.
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const disabled = !connectionId || memory.busy;

    const total = memory.notes.length;
    const byAssistant = memory.notes.filter(note => note.source === 'agent').length;
    const visible = showAll ? memory.notes : memory.notes.slice(0, PREVIEW_COUNT);

    const summary = !connectionId
        ? 'Connect to a database to see its notes.'
        : total === 0
          ? 'None yet. The assistant adds one when it learns something the schema does not show.'
          : `${total} saved for this connection${
                byAssistant > 0 ? `, ${byAssistant} written by the assistant` : ''
            }. They are sent with every question.`;

    const save = async () => {
        if (await memory.add(draft)) setDraft('');
    };

    return (
        <>
            <SettingGroupTitle title='Notes' />
            <SettingAction title='Notes the assistant keeps' description={summary}>
                <Button
                    type='button'
                    variant='ghost'
                    aria-expanded={open}
                    disabled={!connectionId}
                    onClick={() => setOpen(value => !value)}
                >
                    {open ? 'Hide' : total > 0 ? `Show ${total}` : 'Add one'}
                </Button>
            </SettingAction>
            {memory.error && <p className='text-label text-destructive'>{memory.error}</p>}
            {open && (
                <>
                    {total > 0 && (
                        <ul className='flex flex-col' aria-label='Saved notes'>
                            {visible.map(note => (
                                <li key={note.id} className='group relative py-1.5'>
                                    <span className='block min-w-0 text-small'>
                                        {note.source !== 'agent' && (
                                            <Badge className='mr-1.5' variant='muted'>
                                                You
                                            </Badge>
                                        )}
                                        {note.text}
                                    </span>
                                    {confirmingId === note.id ? (
                                        <InlineConfirm
                                            className='absolute top-1 right-0 bg-background shadow-sm'
                                            label='Delete?'
                                            confirmTitle='Delete this note'
                                            cancelTitle='Keep it'
                                            confirming={memory.busy}
                                            onConfirm={() => {
                                                setConfirmingId(null);
                                                void memory.remove(note.id);
                                            }}
                                            onCancel={() => setConfirmingId(null)}
                                        />
                                    ) : (
                                        <Button
                                            type='button'
                                            size='icon'
                                            variant='ghost'
                                            tone='destructive'
                                            disabled={disabled}
                                            // Laid over the end of the row, out of the text's way, so
                                            // the note keeps its full width and never reflows when the
                                            // button appears. Shown on hover, and when the row or the
                                            // button has keyboard focus, so it is never out of reach.
                                            className='absolute top-1 right-0 bg-background opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'
                                            aria-label={`Delete note: ${note.text}`}
                                            title='Delete note'
                                            onClick={() => setConfirmingId(note.id)}
                                        >
                                            <Trash2 size={14} aria-hidden />
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {total > PREVIEW_COUNT && (
                        <div>
                            <Button
                                type='button'
                                variant='ghost'
                                aria-expanded={showAll}
                                onClick={() => setShowAll(value => !value)}
                            >
                                {showAll ? 'Show fewer' : `Show ${total - PREVIEW_COUNT} more`}
                            </Button>
                        </div>
                    )}
                    <SettingField
                        label='Add a note'
                        helperText='At most 300 characters. Enter saves, Shift+Enter adds a line.'
                    >
                        <div className='flex items-end gap-1.5'>
                            <Textarea
                                rows={2}
                                className='min-h-14 resize-none'
                                value={draft}
                                disabled={disabled}
                                maxLength={300}
                                aria-label='New assistant note'
                                placeholder='What a column means, or how two tables join'
                                onChange={event => setDraft(event.target.value)}
                                onKeyDown={event => {
                                    if (
                                        event.key === 'Enter' &&
                                        !event.shiftKey &&
                                        !event.nativeEvent.isComposing &&
                                        draft.trim() !== ''
                                    ) {
                                        event.preventDefault();
                                        void save();
                                    }
                                }}
                            />
                            <Button
                                type='button'
                                disabled={disabled || draft.trim() === ''}
                                onClick={() => void save()}
                            >
                                Save note
                            </Button>
                        </div>
                    </SettingField>
                </>
            )}
        </>
    );
}
