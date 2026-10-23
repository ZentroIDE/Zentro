// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Badge, Button, Input, Label, ScrollArea, Textarea } from '../../components/ui';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { EVENT } from '../../lib/events';
import { wailsEventBus } from '../../lib/eventBus';
import { FEATURE } from '../../lib/license/entitlementMatrix';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import type { AIChangeProposal } from '../../lib/aiAssistant';
import { approveEnabled, changeFriction } from './changeFriction';
import { ProposalReview } from './ProposalReview';

export function ChangesPanel() {
    const gate = useFeatureGate();
    const canType = gate.canUse(FEATURE.SAFETY_TYPE_TO_CONFIRM);
    const canCooldown = gate.canUse(FEATURE.SAFETY_COOLDOWN);
    const [items, setItems] = useState<AIChangeProposal[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [confirmation, setConfirmation] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const load = useCallback(async () => {
        const result = await getApiGateway().ai.listChanges();
        if (!result.ok) {
            setError(result.error.message);
            return;
        }
        const pending = (result.data ?? []).filter(item => item.state === 'pending');
        setItems(pending);
        setSelectedId(current => current || pending[0]?.id || '');
        setError('');
    }, []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => setNow(Date.now()), 250);
        const handler = () => {
            void load();
        };
        const off = wailsEventBus.on(EVENT.AI_PROPOSAL_CHANGED, handler);
        return () => {
            window.clearInterval(timer);
            off();
        };
    }, [load]);

    const selected = items.find(item => item.id === selectedId) ?? null;
    const friction = useMemo(
        () =>
            selected
                ? changeFriction({
                      env: selected.env,
                      requiresTypedConfirm: selected.requiresTypedConfirm,
                      cooldownSeconds: selected.cooldownSeconds,
                      canTypeToConfirm: canType,
                      canCooldown,
                  })
                : { requireTypedConfirm: false, cooldownSeconds: 0 },
        [selected, canType, canCooldown],
    );
    const presented = selected?.reviewPresentedAt ? Date.parse(selected.reviewPresentedAt) : now;
    const remaining =
        friction.cooldownSeconds > 0
            ? Math.max(0, presented + friction.cooldownSeconds * 1000 - now)
            : 0;
    const canApprove = selected
        ? approveEnabled({
              friction,
              confirmation,
              env: selected.env,
              cooldownRemainingMs: remaining,
          })
        : false;

    const approve = async () => {
        if (!selected) return;
        setBusy(true);
        const result = await getApiGateway().ai.approveChange({
            id: selected.id,
            confirmation,
            paramValues: [],
        });
        setBusy(false);
        if (!result.ok) {
            setError(result.error.message);
            return;
        }
        setConfirmation('');
        await load();
    };

    const reject = async () => {
        if (!selected) return;
        setBusy(true);
        const result = await getApiGateway().ai.rejectChange(selected.id, note);
        setBusy(false);
        if (!result.ok) {
            setError(result.error.message);
            return;
        }
        setNote('');
        await load();
    };

    return (
        <div className='flex h-full min-h-0 flex-col gap-2 p-2'>
            <div className='flex items-center gap-2 text-small font-semibold'>
                <ListChecks className='size-4' />
                Changes to review
            </div>
            {error ? <p className='text-small text-destructive'>{error}</p> : null}
            <ScrollArea className='min-h-0 flex-1'>
                {items.length === 0 ? (
                    <p className='text-small text-muted-foreground'>No pending proposals.</p>
                ) : (
                    <ul className='flex flex-col gap-1'>
                        {items.map(item => (
                            <li key={item.id}>
                                <Button
                                    variant={item.id === selectedId ? 'secondary' : 'ghost'}
                                    className='h-auto w-full justify-start py-1'
                                    onClick={() => setSelectedId(item.id)}
                                >
                                    <span className='truncate'>{item.title}</span>
                                    <Badge className='ml-2' variant='muted'>
                                        {item.env}
                                    </Badge>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                {selected ? (
                    <div className='mt-3 flex flex-col gap-2'>
                        <p className='text-small font-semibold'>{selected.title}</p>
                        {selected.rationale ? (
                            <p className='text-small text-muted-foreground'>{selected.rationale}</p>
                        ) : null}
                        <ProposalReview proposal={selected} />
                        <ul className='flex flex-col gap-1'>
                            {(selected.statements ?? []).map(stmt => (
                                <li key={stmt.n} className='text-small'>
                                    <Badge
                                        variant={stmt.risk === 'danger' ? 'destructive' : 'warning'}
                                    >
                                        {stmt.kind}
                                    </Badge>{' '}
                                    {stmt.risk}
                                </li>
                            ))}
                        </ul>
                        {selected.analysis?.impact === 'unavailable' ? (
                            <p className='text-small text-destructive'>
                                chưa đếm được số dòng ảnh hưởng
                                {selected.analysis.reason ? ` (${selected.analysis.reason})` : ''}
                            </p>
                        ) : null}
                        <pre className='overflow-auto rounded-md bg-muted p-2 text-small'>
                            {selected.sqlNormalized}
                        </pre>
                        {friction.requireTypedConfirm ? (
                            <div className='flex flex-col gap-1'>
                                <Label htmlFor='change-confirm'>
                                    Type {selected.env} to confirm
                                </Label>
                                <Input
                                    id='change-confirm'
                                    value={confirmation}
                                    onChange={event => setConfirmation(event.target.value)}
                                />
                            </div>
                        ) : null}
                        <div className='flex flex-col gap-1'>
                            <Label htmlFor='change-note'>Rejection note (optional)</Label>
                            <Textarea
                                id='change-note'
                                value={note}
                                onChange={event => setNote(event.target.value)}
                            />
                        </div>
                        <div className='flex gap-2'>
                            <Button onClick={() => void approve()} disabled={!canApprove || busy}>
                                {remaining > 0
                                    ? `Approve (${Math.ceil(remaining / 1000)}s)`
                                    : 'Approve'}
                            </Button>
                            <Button variant='outline' onClick={() => void reject()} disabled={busy}>
                                Reject
                            </Button>
                        </div>
                    </div>
                ) : null}
            </ScrollArea>
        </div>
    );
}
