// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../components/ui';
import type { AIChangeProposal } from '../../lib/aiAssistant';
import { checkBadgeVariant, checkLabel, checkStatusText, reviewWarnings } from './reviewSummary';

type Props = {
    proposal: AIChangeProposal;
};

// ProposalReview shows the two accounts of a write apart: what the agent says it
// does, and what Zentro measured. They are not merged, so an explanation that
// sounds safe cannot soften a warning the system raised.
export function ProposalReview({ proposal }: Props) {
    const warnings = reviewWarnings(proposal);
    const explanation = proposal.explanation;
    const checks = proposal.checks ?? [];

    return (
        <div className='flex flex-col gap-3'>
            {warnings.length > 0 ? (
                <div
                    role='alert'
                    className='flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/10 p-2'
                >
                    <div className='flex items-center gap-1 text-small font-semibold text-warning'>
                        <AlertTriangle className='size-4' />
                        Read before approving
                    </div>
                    <ul className='list-disc pl-5 text-small'>
                        {warnings.map(warning => (
                            <li key={warning.id}>{warning.text}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <section className='flex flex-col gap-1' aria-label='Explanation from the agent'>
                <p className='text-label text-muted-foreground'>
                    Written by the agent, not verified
                </p>
                {explanation ? (
                    <>
                        <p className='text-small'>{explanation.summary}</p>
                        {explanation.affectedObjects.length > 0 ? (
                            <p className='text-small text-muted-foreground'>
                                Touches: {explanation.affectedObjects.join(', ')}
                            </p>
                        ) : null}
                        <p className='text-small'>
                            <span className='font-semibold'>Afterwards: </span>
                            {explanation.expectedEffect}
                        </p>
                        <div className='text-small'>
                            <span className='font-semibold'>What could go wrong</span>
                            <ul className='list-disc pl-5'>
                                {explanation.risks.map((risk, index) => (
                                    <li key={index}>{risk}</li>
                                ))}
                            </ul>
                        </div>
                        <p className='text-small'>
                            <span className='font-semibold'>Undo: </span>
                            {explanation.rollbackPlan}
                            {explanation.irreversible ? (
                                <Badge className='ml-2' variant='destructive'>
                                    Irreversible
                                </Badge>
                            ) : null}
                        </p>
                    </>
                ) : (
                    <p className='text-small text-destructive'>
                        The agent gave no explanation for this change.
                    </p>
                )}
            </section>

            <section className='flex flex-col gap-1' aria-label='Checks by Zentro'>
                <p className='text-label text-muted-foreground'>Checked by Zentro</p>
                {checks.length === 0 ? (
                    <p className='text-small text-muted-foreground'>No checks were recorded.</p>
                ) : (
                    <ul className='flex flex-col gap-1'>
                        {checks.map(check => (
                            <li key={check.name} className='text-small'>
                                <Badge variant={checkBadgeVariant(check.status)}>
                                    {checkStatusText(check.status)}
                                </Badge>{' '}
                                <span className='font-semibold'>{checkLabel(check.name)}.</span>{' '}
                                {check.detail}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
