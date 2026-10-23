// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Columns3, Database, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MentionCandidate, MentionKind } from './mention';

const KIND_ICON: Record<MentionKind, LucideIcon> = {
    schema: Database,
    table: Table2,
    column: Columns3,
};

const KIND_LABEL: Record<MentionKind, string> = {
    schema: 'Schema',
    table: 'Table',
    column: 'Column',
};

export const mentionOptionId = (index: number) => `assistant-mention-${index}`;

interface AssistantMentionPopupProps {
    items: MentionCandidate[];
    activeIndex: number;
    onPick: (item: MentionCandidate) => void;
    onHover: (index: number) => void;
}

// AssistantMentionPopup lists the schema objects an @ mention can point at.
// The first item is active when the list opens. The panel moves the active
// item with the arrow keys and inserts it with Enter or Tab.
export function AssistantMentionPopup({
    items,
    activeIndex,
    onPick,
    onHover,
}: AssistantMentionPopupProps) {
    if (items.length === 0) return null;
    return (
        <div className='flex flex-col rounded-lg border border-border bg-popover p-1 shadow-md'>
            <div
                role='listbox'
                aria-label='Mention a schema, table, or column'
                className='flex max-h-56 flex-col overflow-y-auto'
            >
                {items.map((item, index) => {
                    const Icon = KIND_ICON[item.kind];
                    const active = index === activeIndex;
                    return (
                        <div
                            key={`${item.kind}-${item.value}`}
                            id={mentionOptionId(index)}
                            role='option'
                            aria-selected={active}
                            data-active={active ? 'true' : undefined}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-small ${
                                active
                                    ? 'bg-[var(--state-selected-bg)] text-[var(--state-selected-text)]'
                                    : 'text-foreground hover:bg-[var(--state-hover-bg,transparent)]'
                            }`}
                            onMouseDown={event => {
                                event.preventDefault();
                                onPick(item);
                            }}
                            onMouseEnter={() => onHover(index)}
                        >
                            <Icon className='size-3.5 shrink-0 opacity-70' aria-hidden />
                            <span className='min-w-0 flex-1 truncate font-mono'>{item.label}</span>
                            <span className='shrink-0 text-label text-muted-foreground'>
                                {KIND_LABEL[item.kind]}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
