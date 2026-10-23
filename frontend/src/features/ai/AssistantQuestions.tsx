// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { ListTree } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../components/ui';
import { currentQuestionIndex, scrollToQuestion, type QuestionItem } from '../../lib/aiQuestionNav';

// A chat shorter than this needs no way to move around it.
export const MIN_QUESTIONS_FOR_NAV = 3;

type Props = {
    items: QuestionItem[];
};

// AssistantQuestions is a small button beside the token count. It opens the
// list of questions asked in this chat, each with its time; a pick scrolls the
// chat to that question. It is not shown for a short chat.
export function AssistantQuestions({ items }: Props) {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState(0);
    if (items.length < MIN_QUESTIONS_FOR_NAV) return null;

    return (
        <Popover
            open={open}
            onOpenChange={next => {
                if (next) setCurrent(currentQuestionIndex(items));
                setOpen(next);
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type='button'
                    size='micro'
                    variant='ghost'
                    className='gap-1 text-muted-foreground'
                    aria-label={`Questions in this chat (${items.length})`}
                    title='Jump to a question (Alt+↑ and Alt+↓ step through them)'
                >
                    <ListTree className='size-3' aria-hidden />
                    {items.length} questions
                </Button>
            </PopoverTrigger>
            <PopoverContent align='start' side='top' className='flex max-h-72 w-80 flex-col p-1'>
                <ul className='flex flex-col overflow-y-auto' aria-label='Questions in this chat'>
                    {items.map((item, index) => (
                        <li key={item.id}>
                            <Button
                                type='button'
                                variant='ghost'
                                aria-current={index === current ? 'true' : undefined}
                                className={`h-auto w-full min-w-0 flex-col items-start gap-0 px-2 py-1 text-left ${
                                    index === current ? 'bg-muted' : ''
                                }`}
                                onClick={() => {
                                    scrollToQuestion(item.id);
                                    setOpen(false);
                                }}
                            >
                                <span className='line-clamp-2 w-full text-small font-normal whitespace-normal wrap-break-word'>
                                    {item.text}
                                </span>
                                {item.time && (
                                    <span className='text-label font-normal text-muted-foreground'>
                                        {item.time}
                                    </span>
                                )}
                            </Button>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}
