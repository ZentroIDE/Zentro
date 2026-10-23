// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button, Input, Label } from '../../components/ui';
import { getEnvironmentMeta } from '../../lib/projects';
import type { QueryPreflightResult } from './safetyPreflight';

export interface WriteGuardFieldsHandle {
    getValues: () => { confirmText: string; reason: string };
    reset: () => void;
}

interface WriteGuardFieldsProps {
    preflight: QueryPreflightResult;
    environmentKey?: string | null;
    unlocking: boolean;
    onUnlock: () => void;
    onInputConfirmDisabledChange: (disabled: boolean) => void;
}

export const WriteGuardFields = React.forwardRef<WriteGuardFieldsHandle, WriteGuardFieldsProps>(
    ({ preflight, environmentKey, unlocking, onUnlock, onInputConfirmDisabledChange }, ref) => {
        const [confirmText, setConfirmText] = React.useState('');
        const [reason, setReason] = React.useState('');

        const confirmTextRef = React.useRef(confirmText);
        const reasonRef = React.useRef(reason);
        confirmTextRef.current = confirmText;
        reasonRef.current = reason;

        React.useImperativeHandle(
            ref,
            () => ({
                getValues: () => ({
                    confirmText: confirmTextRef.current,
                    reason: reasonRef.current,
                }),
                reset: () => {
                    setConfirmText('');
                    setReason('');
                },
            }),
            [],
        );

        const inputConfirmDisabled =
            Boolean(
                preflight.requiresTypeToConfirm &&
                preflight.typeToConfirmText &&
                confirmText.trim() !== preflight.typeToConfirmText,
            ) || Boolean(preflight.requiresReason && !reason.trim());

        React.useLayoutEffect(() => {
            onInputConfirmDisabledChange(inputConfirmDisabled);
        }, [inputConfirmDisabled, onInputConfirmDisabledChange]);

        const environmentLabel = getEnvironmentMeta(environmentKey).label;

        return (
            <div className='space-y-3'>
                {preflight.requiresProductionUnlock && (
                    <div className='flex items-center justify-between gap-3 rounded-md bg-warning/8 px-3 py-2'>
                        <p className='text-label text-warning'>
                            Writes are locked by default in {environmentLabel}.
                        </p>
                        <Button
                            size='sm'
                            variant='destructive'
                            onClick={onUnlock}
                            disabled={unlocking || preflight.productionUnlock.unlocked}
                        >
                            {preflight.productionUnlock.unlocked
                                ? `Unlocked until ${preflight.productionUnlock.unlockUntil || ''}`
                                : unlocking
                                  ? 'Unlocking...'
                                  : 'Unlock for 5 minutes'}
                        </Button>
                    </div>
                )}
                {preflight.requiresTypeToConfirm && preflight.typeToConfirmText && (
                    <div className='space-y-1.5'>
                        <Label className='text-label text-muted-foreground'>
                            Type <strong>{preflight.typeToConfirmText}</strong> to confirm
                        </Label>
                        <Input
                            autoFocus
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder={preflight.typeToConfirmText}
                        />
                    </div>
                )}
                {preflight.requiresReason && (
                    <div className='space-y-1.5'>
                        <Label className='text-label text-muted-foreground'>Reason</Label>
                        <Input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder='Why are you running this change?'
                        />
                    </div>
                )}
            </div>
        );
    },
);
