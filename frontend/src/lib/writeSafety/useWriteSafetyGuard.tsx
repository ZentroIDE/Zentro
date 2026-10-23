// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../../components/ui';
import { UpgradeDialog } from '../../components/layout/UpgradeDialog';
import { useToast } from '../../components/layout/Toast';
import { reportFeatureUsage } from '../../lib/license/featureUsage';
import { ScriptPreviewActions } from './ScriptPreviewActions';
import { WriteConfirmDialog } from './WriteConfirmDialog';
import { FEATURE, type FeatureId } from '../../lib/license/entitlementMatrix';
import { resolveQueryPolicy } from './policy';
import type { QueryAuditMeta, QueryPreflightResult } from './safetyPreflight';
import {
    type OperationRiskAnalysis,
    type SafetyFeatureAccess,
    type SqlRiskAnalysis,
    type WriteOperationKind,
    type WriteSafetyDecision,
    analyzeOperationRisk,
    analyzeSqlRisk,
    buildOperationPreflight,
    evaluateWriteSafetyDecision,
} from './writeSafety';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { getExecuteActionMeta } from '../../lib/executeActionMeta';
import { useShortcutHint } from '../../lib/shortcutDisplay';

export interface WriteSafetyGuardResult {
    allowed: boolean;
    blockedReason?: string;
    auditMeta?: QueryAuditMeta;
    sqlOverride?: string;
    previewOpened?: boolean;
}

/**
 * Something the caller knows about this write that the user should see before
 * confirming, rendered inside the confirm dialog rather than in a dialog of its
 * own. The SQL alone does not tell it, e.g. that rows in other tables reference
 * the ones being deleted. It only ever appears in a confirmation the policy
 * asks for anyway; it does not make the guard ask.
 */
export interface WriteGuardNotice {
    /** `dismiss` closes the dialog as a cancel, for a notice action that leads elsewhere. */
    content: (ctx: { dismiss: () => void }) => React.ReactNode;
}

export interface WriteGuardOptions {
    notice?: WriteGuardNotice;
}

interface UseWriteSafetyGuardOptions {
    onOpenPreview?: (args: {
        sql: string;
        preflight: QueryPreflightResult;
        auditMeta?: QueryAuditMeta;
    }) => Promise<boolean>;
    onCopyScript?: (script: string) => void;
    onOpenScriptInNewTab?: (script: string) => void;
}

type PendingRequest = {
    decision: WriteSafetyDecision;
    notice?: WriteGuardNotice;
    preflight: QueryPreflightResult | null;
    sourceSql?: string;
    previewContent?: string;
    preflightLoading?: boolean;
    resolve: (result: WriteSafetyGuardResult) => void;
};

function wrapSqlInTransaction(sql: string): string {
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    if (!trimmed) return sql;
    return `BEGIN;\n${trimmed};\nCOMMIT;`;
}

function shouldShowUpgradeCta(
    pendingRequest: PendingRequest | null,
    gate: ReturnType<typeof useFeatureGate>,
): boolean {
    if (!pendingRequest?.preflight?.requiresPro) return false;
    return !gate.hasFullAccess;
}

export function useWriteSafetyGuard(
    environmentKey?: string | null,
    options?: UseWriteSafetyGuardOptions,
) {
    const optionsRef = React.useRef(options);
    optionsRef.current = options;
    const gate = useFeatureGate();
    const { toast } = useToast();
    const canUseRecoveryTransactionAssistant = gate.canUse(FEATURE.RECOVERY_TRANSACTION_ASSISTANT);
    const canUseSandboxPreview = gate.canUse(FEATURE.SAFETY_SANDBOX_PREVIEW);
    const safetyFeatures = React.useMemo<SafetyFeatureAccess>(
        () => ({
            productionUnlock: gate.canUse(FEATURE.SAFETY_PRODUCTION_UNLOCK),
            typeToConfirm: gate.canUse(FEATURE.SAFETY_TYPE_TO_CONFIRM),
            cooldown: gate.canUse(FEATURE.SAFETY_COOLDOWN),
            reasonAudit: gate.canUse(FEATURE.SAFETY_REASON_AUDIT),
        }),
        [gate],
    );
    const [pendingRequest, setPendingRequest] = React.useState<PendingRequest | null>(null);
    const [unlocking, setUnlocking] = React.useState(false);
    const [showUpgradeDialog, setShowUpgradeDialog] = React.useState(false);
    const [cooldownLeft, setCooldownLeft] = React.useState(0);
    const runQueryHint = useShortcutHint('editor.runQuery');
    const executeActionMeta = React.useMemo(
        () => getExecuteActionMeta(environmentKey, runQueryHint),
        [environmentKey, runQueryHint],
    );

    const closeWithResult = React.useCallback(
        (request: PendingRequest | null, result: WriteSafetyGuardResult) => {
            if (!request) return;
            request.resolve(result);
        },
        [],
    );

    // Start cooldown once preflight loads with requiresCooldown=true.
    // Depends only on the stable flag so handleUnlock updates don't restart it.
    React.useEffect(() => {
        if (!pendingRequest?.preflight?.requiresCooldown) {
            setCooldownLeft(0);
            return;
        }
        const seconds = pendingRequest.preflight.cooldownSeconds || 3;
        setCooldownLeft(seconds);
        const intervalId = window.setInterval(() => {
            setCooldownLeft(current => {
                if (current <= 1) {
                    window.clearInterval(intervalId);
                    return 0;
                }
                return current - 1;
            });
        }, 1000);
        return () => window.clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingRequest?.preflight?.requiresCooldown, pendingRequest?.preflight?.cooldownSeconds]);

    React.useEffect(() => {
        const preflightQuery = getApiGateway().query.preflight;
        if (!pendingRequest?.sourceSql || !pendingRequest?.preflightLoading || !preflightQuery)
            return;

        let cancelled = false;
        const sourceSql = pendingRequest.sourceSql!;
        void preflightQuery(sourceSql, environmentKey || '').then(result => {
            if (cancelled) return;
            setPendingRequest(current =>
                current
                    ? {
                          ...current,
                          preflight: result.ok ? result.data || null : null,
                          preflightLoading: false,
                      }
                    : current,
            );
        });

        return () => {
            cancelled = true;
        };
    }, [environmentKey, pendingRequest?.preflightLoading, pendingRequest?.sourceSql]);

    const guardFromAnalysis = React.useCallback(
        async (
            analysis: SqlRiskAnalysis | OperationRiskAnalysis,
            actionLabel: string,
            operationsList?: string[],
            sql?: string,
            notice?: WriteGuardNotice,
        ): Promise<WriteSafetyGuardResult> => {
            const policy = resolveQueryPolicy(environmentKey || undefined);
            const decision = evaluateWriteSafetyDecision({
                analysis,
                actionLabel,
                environmentKey,
                safetyLevel: policy.safetyLevel,
            });

            if (decision.action === 'allow') {
                return { allowed: true };
            }

            if (decision.action === 'block') {
                return { allowed: false, blockedReason: decision.message };
            }

            const preflight = sql
                ? null
                : buildOperationPreflight(
                      analysis as OperationRiskAnalysis,
                      environmentKey,
                      safetyFeatures,
                  );

            return new Promise(resolve => {
                setPendingRequest({
                    decision,
                    notice,
                    preflight,
                    sourceSql: sql,
                    previewContent: sql ?? operationsList?.join('\n'),
                    preflightLoading: Boolean(sql && getApiGateway().query.preflight),
                    resolve,
                });
            });
        },
        [environmentKey, safetyFeatures],
    );

    const guardSql = React.useCallback(
        async (
            sql: string,
            actionLabel: string,
            options?: WriteGuardOptions,
        ): Promise<WriteSafetyGuardResult> => {
            return guardFromAnalysis(
                analyzeSqlRisk(sql),
                actionLabel,
                undefined,
                sql,
                options?.notice,
            );
        },
        [guardFromAnalysis],
    );

    const guardOperations = React.useCallback(
        async (
            operations: WriteOperationKind[],
            actionLabel: string,
            operationsList?: string[],
        ): Promise<WriteSafetyGuardResult> => {
            return guardFromAnalysis(analyzeOperationRisk(operations), actionLabel, operationsList);
        },
        [guardFromAnalysis],
    );

    const handleClose = React.useCallback(() => {
        if (!pendingRequest) return;
        closeWithResult(pendingRequest, { allowed: false });
        setPendingRequest(null);
    }, [closeWithResult, pendingRequest]);

    const handleUnlock = React.useCallback(async () => {
        const unlockProductionWrites = getApiGateway().query.unlockProductionWrites;
        if (!pendingRequest?.preflight?.requiresProductionUnlock || !unlockProductionWrites) return;
        try {
            setUnlocking(true);
            const result = await unlockProductionWrites(environmentKey || '');
            if (!result.ok) return;
            const unlocked = result.data;
            if (!unlocked) return;
            reportFeatureUsage(gate.isTrial, FEATURE.SAFETY_PRODUCTION_UNLOCK);
            setPendingRequest(current =>
                current
                    ? {
                          ...current,
                          preflight: current.preflight
                              ? {
                                    ...current.preflight,
                                    productionUnlock: unlocked,
                                    requiresProductionUnlock: !unlocked.unlocked,
                                }
                              : current.preflight,
                      }
                    : current,
            );
        } finally {
            setUnlocking(false);
        }
    }, [environmentKey, gate, pendingRequest?.preflight?.requiresProductionUnlock]);

    const handleConfirm = React.useCallback(
        (confirmText: string, reason: string, sqlOverride?: string) => {
            if (!pendingRequest) return;
            const preflight = pendingRequest.preflight;
            if (preflight?.requiresProductionUnlock && !preflight.productionUnlock.unlocked) return;
            if (
                preflight?.requiresTypeToConfirm &&
                preflight.typeToConfirmText &&
                confirmText.trim() !== preflight.typeToConfirmText
            )
                return;
            if (preflight?.requiresReason && !reason.trim()) return;
            if (preflight?.requiresCooldown && cooldownLeft > 0) return;

            // Falling back to `undefined` here when preflight never loaded would
            // silently drop the confirmation: the BasicConfirmField path (see
            // WriteConfirmContent's showBasicConfirmField) lets the user complete
            // strong confirmation with no preflight at all, but callers only call
            // setPendingQueryAuditMeta when auditMeta is truthy — so without this
            // fallback, a completed confirmation never reaches the backend and
            // validateStrictWriteSafety's hasAuditMeta bypass still rejects the
            // write with a raw error, even though the user just confirmed it.
            const auditMeta: QueryAuditMeta = preflight
                ? {
                      reason: reason.trim() || undefined,
                      riskLevel: preflight.riskLevel,
                      previewRowCount: preflight.affectedRowsPreview.affectedRowCount,
                      usedProtectionLayers: preflight.usedProtectionLayers || [],
                  }
                : {
                      reason: reason.trim() || undefined,
                      riskLevel: pendingRequest.decision.severity,
                  };

            for (const layer of preflight?.usedProtectionLayers || []) {
                reportFeatureUsage(gate.isTrial, layer as FeatureId);
            }

            closeWithResult(pendingRequest, { allowed: true, auditMeta, sqlOverride });
            setPendingRequest(null);
        },
        [closeWithResult, cooldownLeft, gate, pendingRequest],
    );

    const preview = pendingRequest?.preflight;
    const previewSupportsLargePreview =
        canUseSandboxPreview &&
        Boolean(pendingRequest?.sourceSql) &&
        Boolean(
            preview?.statements?.some(
                s =>
                    s.previewSupported &&
                    (s.operation.toLowerCase() === 'update' ||
                        s.operation.toLowerCase() === 'delete'),
            ),
        );

    const handleOpenPreview = React.useCallback(
        async (reason: string) => {
            if (!pendingRequest?.sourceSql || !preview || !optionsRef.current?.onOpenPreview)
                return;
            const auditMeta: QueryAuditMeta | undefined = {
                reason: reason.trim() || undefined,
                riskLevel: preview.riskLevel,
                previewRowCount: preview.affectedRowsPreview.affectedRowCount,
                usedProtectionLayers: preview.usedProtectionLayers || [],
            };
            const opened = await optionsRef.current.onOpenPreview({
                sql: pendingRequest.sourceSql,
                preflight: preview,
                auditMeta,
            });
            if (!opened) return;
            reportFeatureUsage(gate.isTrial, FEATURE.SAFETY_SANDBOX_PREVIEW);
            closeWithResult(pendingRequest, { allowed: false, previewOpened: true });
            setPendingRequest(null);
        },
        [closeWithResult, gate, pendingRequest, preview],
    );

    const transactionSuggested =
        canUseRecoveryTransactionAssistant &&
        Boolean(preview?.transactionSuggested) &&
        Boolean(pendingRequest?.sourceSql);
    const canPromptUpgrade = shouldShowUpgradeCta(pendingRequest, gate);

    const closeUpgradeDialog = React.useCallback(() => {
        setShowUpgradeDialog(false);
    }, []);

    const modals = React.useMemo(
        () => (
            <>
                <WriteConfirmDialog
                    open={Boolean(pendingRequest)}
                    onOpenChange={open => !open && handleClose()}
                    title={pendingRequest?.decision.title || 'Confirm Write Operation'}
                    decision={pendingRequest?.decision ?? null}
                    preflight={preview ?? null}
                    loading={Boolean(pendingRequest?.preflightLoading)}
                    notice={pendingRequest?.notice?.content({ dismiss: handleClose })}
                    cooldownLeft={cooldownLeft}
                    unlocking={unlocking}
                    onUnlock={() => void handleUnlock()}
                    transactionSuggested={transactionSuggested}
                    scriptContent={pendingRequest?.previewContent}
                    onOpenLargePreview={
                        previewSupportsLargePreview && optionsRef.current?.onOpenPreview
                            ? (reason: string) => void handleOpenPreview(reason)
                            : null
                    }
                    largePreviewSupported={previewSupportsLargePreview}
                    largePreviewLoading={Boolean(pendingRequest?.preflightLoading)}
                    environmentKey={environmentKey}
                    showSecondaryCta={canPromptUpgrade}
                    secondaryCtaLabel='Upgrade to Pro'
                    onSecondaryCta={() => setShowUpgradeDialog(true)}
                    footer={({ confirmDisabled, getValues, requiresTextInput }) => (
                        <>
                            <ScriptPreviewActions
                                onCopy={
                                    pendingRequest?.previewContent &&
                                    optionsRef.current?.onCopyScript
                                        ? () =>
                                              optionsRef.current?.onCopyScript?.(
                                                  pendingRequest.previewContent!,
                                              )
                                        : null
                                }
                                onOpenInNewTab={
                                    pendingRequest?.previewContent &&
                                    optionsRef.current?.onOpenScriptInNewTab
                                        ? () => {
                                              optionsRef.current?.onOpenScriptInNewTab?.(
                                                  pendingRequest.previewContent!,
                                              );
                                              closeWithResult(pendingRequest, { allowed: false });
                                              setPendingRequest(null);
                                          }
                                        : null
                                }
                            />
                            {transactionSuggested && pendingRequest?.sourceSql && (
                                <Button
                                    variant='default'
                                    onClick={() => {
                                        const { confirmText, reason } = getValues();
                                        handleConfirm(
                                            confirmText,
                                            reason,
                                            wrapSqlInTransaction(pendingRequest.sourceSql!),
                                        );
                                    }}
                                    disabled={confirmDisabled}
                                >
                                    Wrap in Transaction
                                </Button>
                            )}
                            <Button
                                variant={
                                    pendingRequest?.decision.severity === 'danger'
                                        ? 'destructive'
                                        : 'default'
                                }
                                className={executeActionMeta.confirmButtonClassName}
                                autoFocus={!requiresTextInput}
                                onClick={() => {
                                    const { confirmText, reason } = getValues();
                                    handleConfirm(confirmText, reason);
                                }}
                                disabled={confirmDisabled}
                            >
                                {pendingRequest?.decision.action === 'block'
                                    ? pendingRequest.decision.confirmLabel
                                    : executeActionMeta.actionLabel}
                            </Button>
                        </>
                    )}
                />
                <UpgradeDialog
                    open={showUpgradeDialog}
                    onClose={closeUpgradeDialog}
                    source='write-confirm'
                    upgradeUrl={gate.upgradeUrl}
                />
            </>
        ),
        [
            canPromptUpgrade,
            closeUpgradeDialog,
            cooldownLeft,
            environmentKey,
            executeActionMeta,
            gate.upgradeUrl,
            handleClose,
            handleConfirm,
            handleOpenPreview,
            handleUnlock,
            pendingRequest,
            preview,
            previewSupportsLargePreview,
            showUpgradeDialog,
            transactionSuggested,
            unlocking,
        ],
    );

    return {
        guardSql,
        guardOperations,
        modals,
    };
}
