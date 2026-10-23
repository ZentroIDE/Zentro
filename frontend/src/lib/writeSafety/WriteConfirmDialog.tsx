// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui';
import type { QueryPreflightResult } from './safetyPreflight';
import type { WriteSafetyDecision } from './writeSafety';
import { WriteConfirmContent } from './WriteConfirmContent';
import type { WriteGuardFieldsHandle } from './WriteGuardFields';

export interface WriteConfirmDialogFooterCtx {
    confirmDisabled: boolean;
    /** Always returns the latest confirmText/reason — safe to call in onClick handlers */
    getValues: () => { confirmText: string; reason: string };
    /** True when the dialog has a text input (typeToConfirm or reason). Use to conditionally
     *  apply autoFocus: set autoFocus={!requiresTextInput} on the confirm button so the
     *  input gets focus instead. */
    requiresTextInput: boolean;
}

interface WriteConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    decision: WriteSafetyDecision | null;
    preflight: QueryPreflightResult | null;
    loading: boolean;
    notice?: React.ReactNode;
    cooldownLeft: number;
    unlocking: boolean;
    onUnlock: () => void;
    transactionSuggested?: boolean;
    scriptContent?: string;
    onOpenLargePreview?: ((reason: string) => void) | null;
    largePreviewSupported?: boolean;
    largePreviewLoading?: boolean;
    environmentKey?: string | null;
    showSecondaryCta?: boolean;
    secondaryCtaLabel?: string;
    onSecondaryCta?: () => void;
    secondaryCtaDisabled?: boolean;
    /**
     * Render the footer actions. Use `getValues()` inside onClick handlers to
     * read the latest confirmText/reason — never close over them directly, as
     * the footer is memoized and won't re-render on every keystroke.
     */
    footer: (ctx: WriteConfirmDialogFooterCtx) => React.ReactNode;
}

export const WriteConfirmDialog: React.FC<WriteConfirmDialogProps> = ({
    open,
    onOpenChange,
    title,
    decision,
    preflight,
    loading,
    notice,
    cooldownLeft,
    unlocking,
    onUnlock,
    transactionSuggested,
    scriptContent,
    onOpenLargePreview,
    largePreviewSupported,
    largePreviewLoading,
    environmentKey,
    showSecondaryCta,
    secondaryCtaLabel,
    onSecondaryCta,
    secondaryCtaDisabled,
    footer,
}) => {
    const fieldsRef = React.useRef<WriteGuardFieldsHandle>(null);
    const [inputConfirmDisabled, setInputConfirmDisabled] = React.useState(true);

    React.useEffect(() => {
        if (!open) {
            fieldsRef.current?.reset();
            setInputConfirmDisabled(true);
        }
    }, [open]);

    const requiresTextInput = Boolean(
        preflight?.requiresTypeToConfirm ||
        preflight?.requiresReason ||
        (!preflight && decision?.requiresDoubleConfirm),
    );

    const confirmDisabled =
        loading ||
        Boolean(preflight?.requiresProductionUnlock && !preflight.productionUnlock.unlocked) ||
        (requiresTextInput && inputConfirmDisabled) ||
        Boolean(preflight?.requiresCooldown && cooldownLeft > 0);

    // Reads from the fields component at call-time — always current, no stale closures.
    const getValues = React.useCallback(
        () => fieldsRef.current?.getValues() ?? { confirmText: '', reason: '' },
        [],
    );

    // footerRef holds the latest footer function without being a useMemo dep.
    // This prevents footerContent from recomputing every time the parent re-renders
    // (e.g. every second due to cooldownLeft), which would recreate the Button JSX
    // and could cause Radix UI's focus trap to reassign focus away from the input.
    const footerRef = React.useRef(footer);
    footerRef.current = footer;

    // Only recompute the footer JSX when confirmDisabled, requiresTextInput, or the
    // open/closed transition changes — never on every keystroke or every cooldown
    // tick. `open` must be a dep: for a plain destructive confirm with no extra
    // guard fields, confirmDisabled/requiresTextInput are identical before and
    // after the dialog opens (both false), so without `open` here this memo would
    // never re-run across that transition — freezing the footer's onClick closure
    // on the pre-open render, where the parent's handleConfirm still closed over a
    // null pendingRequest. Clicking Execute would then silently no-op forever:
    // no toast, no dialog close, no error — because handleConfirm's own
    // `if (!pendingRequest) return;` guard fired on stale state.
    const footerContent = React.useMemo(
        () => footerRef.current({ confirmDisabled, getValues, requiresTextInput }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [confirmDisabled, getValues, requiresTextInput, open],
    );

    const handleOpenLargePreview = onOpenLargePreview
        ? () => onOpenLargePreview(fieldsRef.current?.getValues().reason ?? '')
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='p-0 max-w-xl max-h-[90vh] overflow-hidden'>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <WriteConfirmContent
                    decision={decision}
                    preflight={preflight}
                    loading={loading}
                    notice={notice}
                    fieldsRef={fieldsRef}
                    onInputConfirmDisabledChange={setInputConfirmDisabled}
                    cooldownLeft={cooldownLeft}
                    unlocking={unlocking}
                    onUnlock={onUnlock}
                    transactionSuggested={transactionSuggested}
                    scriptContent={scriptContent}
                    onOpenLargePreview={handleOpenLargePreview}
                    largePreviewSupported={largePreviewSupported}
                    largePreviewLoading={largePreviewLoading}
                    environmentKey={environmentKey}
                />

                <DialogFooter>
                    {showSecondaryCta && secondaryCtaLabel && onSecondaryCta ? (
                        <Button
                            variant='ghost'
                            size='sm'
                            className='mr-auto'
                            onClick={onSecondaryCta}
                            disabled={secondaryCtaDisabled}
                        >
                            {secondaryCtaLabel}
                        </Button>
                    ) : null}
                    {footerContent}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
