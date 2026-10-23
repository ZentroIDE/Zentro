// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Button } from '../../components/ui';
import type { AISentRound } from '../../lib/aiAssistant';
import { formatBytes, readableBody } from './rowApproval';

type Props = {
    rounds: AISentRound[];
};

// AssistantSentRounds lists every request a reply sent to the model, so the
// user can read each one byte for byte, not only the first they reviewed
// (ADR 0017). In a saved chat, rows that were shared show as a short note.
export function AssistantSentRounds({ rounds }: Props) {
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState<number | null>(null);
    if (rounds.length === 0) return null;
    const host = rounds[0].host;
    const total = rounds.reduce((sum, round) => sum + round.bytes, 0);

    return (
        <div className='flex flex-col gap-1'>
            <Button
                type='button'
                variant='ghost'
                className='h-auto justify-start p-0 text-label text-muted-foreground'
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                Sent to {host} · {rounds.length} request{rounds.length === 1 ? '' : 's'} ·{' '}
                {formatBytes(total)}
            </Button>
            {open && (
                <ul className='flex flex-col gap-1'>
                    {rounds.map(round => (
                        <li key={round.round} className='flex flex-col gap-1'>
                            <Button
                                type='button'
                                variant='ghost'
                                className='h-auto justify-start p-0 text-label'
                                aria-expanded={shown === round.round}
                                onClick={() =>
                                    setShown(current =>
                                        current === round.round ? null : round.round,
                                    )
                                }
                            >
                                Request {round.round + 1} · {formatBytes(round.bytes)}
                                {round.carriesRows ? ' · carried shared rows' : ''}
                            </Button>
                            {shown === round.round && (
                                <pre className='max-h-64 overflow-auto rounded-md bg-muted p-2 text-label'>
                                    {readableBody(round.body)}
                                </pre>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
