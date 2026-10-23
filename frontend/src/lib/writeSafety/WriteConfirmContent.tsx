// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import type { QueryPreflightResult } from './safetyPreflight';
import type { WriteSafetyDecision } from './writeSafety';
import { WriteGuardFields } from './WriteGuardFields';
import type { WriteGuardFieldsHandle } from './WriteGuardFields';
import { BasicConfirmField } from './BasicConfirmField';

export interface WriteConfirmContentProps {
    /** Optional heading line, e.g. table-specific context text */
    topDescription?: React.ReactNode;
    /** Extra facts about this write worth a look before confirming, shown under the risk banner. */
    notice?: React.ReactNode;
    decision: WriteSafetyDecision | null;
    preflight: QueryPreflightResult | null;
    loading: boolean;
    fieldsRef: React.Ref<WriteGuardFieldsHandle>;
    onInputConfirmDisabledChange: (disabled: boolean) => void;
    cooldownLeft: number;
    unlocking: boolean;
    onUnlock: () => void;
    /** Show the "not wrapped in a transaction" hint banner */
    transactionSuggested?: boolean;
    /** If provided a script section is rendered below Section 1 */
    scriptContent?: string;
    /** Show the large-preview eye icon next to affected rows */
    onOpenLargePreview?: (() => void) | null;
    largePreviewSupported?: boolean;
    largePreviewLoading?: boolean;
    environmentKey?: string | null;
}

export const WriteConfirmContent: React.FC<WriteConfirmContentProps> = ({
    topDescription,
    notice,
    decision,
    preflight,
    loading,
    fieldsRef,
    onInputConfirmDisabledChange,
    cooldownLeft,
    unlocking,
    onUnlock,
    transactionSuggested,
    scriptContent,
    onOpenLargePreview,
    largePreviewSupported,
    largePreviewLoading,
    environmentKey,
}) => {
    const advancedProtectionSummary = React.useMemo(() => {
        if (!preflight?.requiresPro) return '';
        const items: string[] = [];
        if (environmentKey === ENVIRONMENT_KEY.PRODUCTION) {
            items.push('production write unlock');
        }
        // Sandbox preview and schema rollback are plan-level facts, not
        // per-query preflight fields — list them unconditionally whenever
        // this banner shows at all.
        items.push('sandbox preview', 'schema rollback');
        if (preflight.requiresTypeToConfirm) {
            items.push('typed confirmation');
        }
        if (preflight.requiresCooldown) {
            items.push('cooldown');
        }
        if (preflight.requiresReason) {
            items.push('audit reason');
        }
        if (items.length === 0) {
            items.push('stronger production safety controls');
        }
        return items.join(', ');
    }, [environmentKey, preflight]);
    const showRiskSection = decision?.action === 'confirm';
    const hasScriptContent = scriptContent !== undefined;
    const expandTransitionClass = 'overflow-hidden transition-[max-height] duration-300 ease-out';
    const showRiskContent = showRiskSection && !loading && Boolean(preflight);
    const showRiskLoadingState = loading && (decision === null || showRiskSection);
    const collapsedPreviewHeightClass = 'max-h-12';

    const showGuardFields =
        showRiskContent &&
        Boolean(preflight) &&
        (Boolean(preflight?.requiresProductionUnlock) ||
            Boolean(preflight?.requiresTypeToConfirm) ||
            Boolean(preflight?.requiresCooldown) ||
            Boolean(preflight?.requiresReason));
    // SQL risk-analysis path (no preflight) still needs a way to surface
    // strict-mode's strong-confirmation requirement — otherwise every safety
    // level renders an identical single-click dialog.
    const showBasicConfirmField =
        showRiskContent && !preflight && Boolean(decision?.requiresDoubleConfirm);

    const affectedRows = preflight?.affectedRowsPreview;
    const showAffectedRows = Boolean(affectedRows?.supported && affectedRows?.countKnown);
    const showScriptFooter =
        scriptContent !== undefined && (Boolean(preflight?.requiresCooldown) || showAffectedRows);
    const showLoadingPreview = showRiskLoadingState || (showRiskSection && !showRiskContent);
    const showRiskBlock = showRiskContent || showLoadingPreview;

    return (
        <>
            {/* Section 1 — confirmation */}
            <div className='px-4 space-y-3'>
                {topDescription}
                {(showRiskSection || showRiskLoadingState) && (
                    <div className='space-y-3'>
                        {showRiskBlock ? (
                            <div
                                className={`${expandTransitionClass} ${
                                    showRiskContent ? 'max-h-40' : collapsedPreviewHeightClass
                                }`}
                            >
                                {showLoadingPreview ? (
                                    <p className='text-label text-muted-foreground'>
                                        Checking write safety preview...
                                    </p>
                                ) : null}
                                {showRiskContent ? (
                                    <div
                                        className={`rounded-md px-3 py-3 ${
                                            decision!.severity === 'danger'
                                                ? 'bg-destructive/8 text-destructive'
                                                : 'bg-warning/10 text-warning'
                                        }`}
                                    >
                                        <div className='flex items-center justify-between gap-3'>
                                            <p className='text-label'>{decision!.message}</p>
                                            {preflight?.riskLevel ? (
                                                <span className='shrink-0 rounded-md bg-background/50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide'>
                                                    {preflight.riskLevel}
                                                </span>
                                            ) : null}
                                        </div>
                                        {decision!.description ? (
                                            <p className='text-label mt-1 opacity-70'>
                                                {decision!.description}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {showRiskContent && preflight?.requiresPro ? (
                            <div className={`${expandTransitionClass} max-h-16`}>
                                <div className='rounded-md bg-success/10 px-3 py-2 text-label text-success'>
                                    Pro adds {advancedProtectionSummary} for this flow.
                                </div>
                            </div>
                        ) : null}

                        {showRiskContent && transactionSuggested ? (
                            <div className={`${expandTransitionClass} max-h-20`}>
                                <div className='rounded-md bg-accent/8 px-3 py-2 text-label text-foreground'>
                                    This risky write batch is not wrapped in a transaction yet. You
                                    can wrap it in <strong>BEGIN / COMMIT</strong> before running.
                                </div>
                            </div>
                        ) : null}

                        {showGuardFields ? (
                            <div className={`${expandTransitionClass} max-h-128`}>
                                <WriteGuardFields
                                    ref={fieldsRef}
                                    preflight={preflight!}
                                    environmentKey={environmentKey}
                                    unlocking={unlocking}
                                    onUnlock={onUnlock}
                                    onInputConfirmDisabledChange={onInputConfirmDisabledChange}
                                />
                            </div>
                        ) : null}

                        {showBasicConfirmField ? (
                            <div className={`${expandTransitionClass} max-h-40`}>
                                <BasicConfirmField
                                    ref={fieldsRef}
                                    onInputConfirmDisabledChange={onInputConfirmDisabledChange}
                                />
                            </div>
                        ) : null}
                    </div>
                )}
                {notice ? <div className='max-h-72 overflow-y-auto pb-3'>{notice}</div> : null}
            </div>

            {/* Section 2 — script */}
            <div className='bg-muted/25 px-4 py-3 space-y-1.5'>
                <p className='text-label text-muted-foreground'>Script</p>
                <div
                    className={`${expandTransitionClass} rounded-md bg-muted/40 text-label text-muted-foreground ${
                        hasScriptContent ? 'max-h-65' : collapsedPreviewHeightClass
                    }`}
                >
                    <div className='max-h-65 overflow-y-auto p-3 whitespace-pre-wrap select-text'>
                        {scriptContent === undefined ? (
                            <span className='text-label text-muted-foreground'>
                                Preparing script preview...
                            </span>
                        ) : (
                            scriptContent
                        )}
                    </div>
                </div>
                {showScriptFooter ? (
                    <div className={`${expandTransitionClass} max-h-16`}>
                        <div className='flex items-center justify-between'>
                            {preflight?.requiresCooldown ? (
                                <p className='text-label text-muted-foreground'>
                                    Cooldown:{' '}
                                    {cooldownLeft > 0 ? `${cooldownLeft}s remaining` : 'Ready'}
                                </p>
                            ) : (
                                <span />
                            )}
                            {showAffectedRows && (
                                <div className='flex items-center gap-1.5'>
                                    <p className='text-label text-muted-foreground'>
                                        Affected rows: about{' '}
                                        <strong>
                                            {(affectedRows!.affectedRowCount ?? 0).toLocaleString()}
                                        </strong>
                                    </p>
                                    {largePreviewSupported && onOpenLargePreview ? (
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='icon'
                                            className='h-7 w-7 shrink-0'
                                            title='Open large preview'
                                            aria-label='Open large preview'
                                            disabled={largePreviewLoading}
                                            onClick={onOpenLargePreview}
                                        >
                                            {largePreviewLoading ? (
                                                <Loader2 size={14} className='animate-spin' />
                                            ) : (
                                                <Eye size={14} />
                                            )}
                                        </Button>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
};
