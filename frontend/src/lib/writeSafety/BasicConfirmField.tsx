// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Input, Label } from '../../components/ui';
import type { WriteGuardFieldsHandle } from './WriteGuardFields';

const CONFIRM_WORD = 'CONFIRM';

interface BasicConfirmFieldProps {
    onInputConfirmDisabledChange: (disabled: boolean) => void;
}

/**
 * Typed confirmation for strict-mode destructive/no-WHERE writes on the SQL
 * risk-analysis path (no QueryPreflightResult, so WriteGuardFields' Pro-gated
 * fields never render there). Available on every tier — Strict's "strong
 * confirmation" is a basic safety-level distinction, not a Pro enforcement
 * feature — so relaxed/balanced/strict actually look and behave differently
 * instead of all showing the same single-click dialog.
 */
export const BasicConfirmField = React.forwardRef<WriteGuardFieldsHandle, BasicConfirmFieldProps>(
    ({ onInputConfirmDisabledChange }, ref) => {
        const [confirmText, setConfirmText] = React.useState('');
        const confirmTextRef = React.useRef(confirmText);
        confirmTextRef.current = confirmText;

        React.useImperativeHandle(
            ref,
            () => ({
                getValues: () => ({ confirmText: confirmTextRef.current, reason: '' }),
                reset: () => setConfirmText(''),
            }),
            [],
        );

        const disabled = confirmText.trim().toUpperCase() !== CONFIRM_WORD;

        React.useLayoutEffect(() => {
            onInputConfirmDisabledChange(disabled);
        }, [disabled, onInputConfirmDisabledChange]);

        return (
            <div className='space-y-1.5'>
                <Label className='text-label text-muted-foreground'>
                    Strict safety requires typing <strong>{CONFIRM_WORD}</strong> to proceed
                </Label>
                <Input
                    autoFocus
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_WORD}
                />
            </div>
        );
    },
);
