// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button, Textarea } from '../../components/ui';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { cn } from '../../lib/cn';

const RATINGS = [
    { value: 1, emoji: '😞', label: 'Very unhappy' },
    { value: 2, emoji: '🙁', label: 'Unhappy' },
    { value: 3, emoji: '😐', label: 'Neutral' },
    { value: 4, emoji: '🙂', label: 'Happy' },
    { value: 5, emoji: '😄', label: 'Very happy' },
] as const;
const TOAST_DURATION_MS = 30000;

function submitFeedback(rating: number, comment: string) {
    void getApiGateway()
        .settings.submitFeedback?.(rating, comment)
        ?.catch(() => {
            // Best-effort: never surface a failure for this low-friction ask.
        });
}

function EmojiRating({
    rating,
    onRate,
}: {
    rating: number | null;
    onRate: (value: number) => void;
}) {
    return (
        <div
            className='flex items-center justify-evenly'
            role='radiogroup'
            aria-label='Rating out of 5'
        >
            {RATINGS.map(({ value, emoji, label }) => {
                const selected = value === rating;
                return (
                    <Button
                        key={value}
                        type='button'
                        variant='ghost'
                        size='icon'
                        role='radio'
                        aria-checked={selected}
                        aria-label={label}
                        className={cn(
                            'h-8 w-8 text-4xl leading-none transition-all hover:scale-125 hover:grayscale-0 hover:bg-transparent',
                            selected ? 'scale-125 grayscale-0' : 'grayscale opacity-70',
                        )}
                        onClick={() => onRate(value)}
                    >
                        <span aria-hidden='true'>{emoji}</span>
                    </Button>
                );
            })}
        </div>
    );
}

function FeedbackToastBody({ toastId }: { toastId: string | number }) {
    const [rating, setRating] = React.useState<number | null>(null);
    const [comment, setComment] = React.useState('');

    const close = () => sonnerToast.dismiss(toastId);

    const send = () => {
        if (rating === null) return;
        submitFeedback(rating, comment.trim());
        close();
    };

    return (
        <div className='pointer-events-auto flex w-96 flex-col gap-2.5 rounded-md border border-border/70 bg-card px-5 py-4 shadow-elevation-md'>
            <div className='flex flex-col gap-1.5'>
                <div className='flex flex-col gap-1'>
                    <p className='text-section font-semibold text-foreground'>
                        Is Zentro actually helping you?
                    </p>
                    <p className='text-label text-muted-foreground'>
                        We read every response ourselves — it genuinely shapes what we build next.
                    </p>
                </div>
                <EmojiRating rating={rating} onRate={setRating} />
            </div>

            <div className='flex flex-col gap-1'>
                <p className='text-label font-semibold text-foreground'>Additional feedback</p>
                <Textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder='If you have any additional feedback, please type it in here...'
                    rows={3}
                    className='resize-none bg-background text-label'
                />
            </div>

            <div className='flex items-center justify-end gap-2'>
                <Button type='button' variant='ghost' size='sm' onClick={close}>
                    Not now
                </Button>
                <Button
                    type='button'
                    variant='default'
                    size='sm'
                    disabled={rating === null}
                    onClick={send}
                >
                    Send
                </Button>
            </div>
        </div>
    );
}

/** Shows the one-time "rate your experience" prompt as a low-friction toast:
 *  emoji rating + optional comment in a single view. Caller is responsible
 *  for only invoking this once ShouldPromptForFeedback/MarkFeedbackPrompted
 *  have been checked (see useFeedbackPrompt). */
export function showFeedbackPromptToast() {
    sonnerToast.custom(toastId => <FeedbackToastBody toastId={toastId} />, {
        duration: TOAST_DURATION_MS,
    });
}
