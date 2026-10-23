// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { useResultStore } from '../../../stores/resultStore';

interface UseWritePreviewOptions {
    tabId: string;
    persistedContext:
        | {
              isWritePreview?: boolean;
              writePreviewSessionId?: string;
              writePreviewOriginalSql?: string;
              writePreviewSourceTabId?: string;
              writePreviewEnvironmentKey?: string;
              writePreviewRiskLevel?: string;
              writePreviewPreviewRowCount?: number;
              writePreviewUsedProtectionLayers?: string[];
          }
        | undefined;
    updateTabContext: (tabId: string, context: Record<string, unknown>) => void;
    toast: { error: (msg: string) => void };
}

interface UseWritePreviewReturn {
    isWritePreviewTab: boolean;
    writePreviewActionLoading: 'confirm' | 'cancel' | null;
    handleCancelWritePreview: () => Promise<void>;
    handleConfirmWritePreview: () => Promise<void>;
    closeWritePreview: () => Promise<void>;
    clearWritePreviewContext: () => void;
}

export function useWritePreview({
    tabId,
    persistedContext,
    updateTabContext,
    toast,
}: UseWritePreviewOptions): UseWritePreviewReturn {
    const [writePreviewActionLoading, setWritePreviewActionLoading] = React.useState<
        'confirm' | 'cancel' | null
    >(null);

    const isWritePreviewTab = persistedContext?.isWritePreview === true;

    const clearWritePreviewContext = React.useCallback(() => {
        updateTabContext(tabId, {
            isWritePreview: undefined,
            writePreviewSessionId: undefined,
            writePreviewOriginalSql: undefined,
            writePreviewSourceTabId: undefined,
            writePreviewEnvironmentKey: undefined,
            writePreviewRiskLevel: undefined,
            writePreviewPreviewRowCount: undefined,
            writePreviewUsedProtectionLayers: undefined,
        });
    }, [tabId, updateTabContext]);

    const closeWritePreview = React.useCallback(async () => {
        if (persistedContext?.writePreviewSessionId) {
            await getApiGateway().query.closeWritePreview?.(persistedContext.writePreviewSessionId);
        }
        useResultStore.getState().clearResult(tabId);
        clearWritePreviewContext();
    }, [clearWritePreviewContext, persistedContext?.writePreviewSessionId, tabId]);

    const handleCancelWritePreview = React.useCallback(async () => {
        try {
            setWritePreviewActionLoading('cancel');
            await closeWritePreview();
        } catch (error) {
            toast.error(`Could not close write preview: ${String(error)}`);
        } finally {
            setWritePreviewActionLoading(null);
        }
    }, [closeWritePreview, toast]);

    const handleConfirmWritePreview = React.useCallback(async () => {
        const originalSql = persistedContext?.writePreviewOriginalSql;
        if (!originalSql) return;

        try {
            setWritePreviewActionLoading('confirm');
            await closeWritePreview();

            const setPendingQueryAuditMeta = getApiGateway().query.setPendingQueryAuditMeta;
            if (setPendingQueryAuditMeta) {
                await setPendingQueryAuditMeta(tabId, {
                    riskLevel: persistedContext?.writePreviewRiskLevel,
                    previewRowCount: persistedContext?.writePreviewPreviewRowCount,
                    usedProtectionLayers: persistedContext?.writePreviewUsedProtectionLayers,
                });
            }

            unwrapOrThrow(await getApiGateway().query.execute(tabId, originalSql));
        } catch (error) {
            toast.error(`Could not run previewed write: ${String(error)}`);
        } finally {
            setWritePreviewActionLoading(null);
        }
    }, [
        closeWritePreview,
        persistedContext?.writePreviewOriginalSql,
        persistedContext?.writePreviewPreviewRowCount,
        persistedContext?.writePreviewRiskLevel,
        persistedContext?.writePreviewUsedProtectionLayers,
        tabId,
        toast,
    ]);

    return {
        isWritePreviewTab,
        writePreviewActionLoading,
        handleCancelWritePreview,
        handleConfirmWritePreview,
        closeWritePreview,
        clearWritePreviewContext,
    };
}
