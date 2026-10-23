// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import type { ResultPanelSaveFlowDeps } from './types';

export function useResultPanelSaveFlow({
    tabId,
    result,
    viewMode,
    hasPendingChanges,
    generatePendingScript,
    guardSql,
    resolveDeleteNotice,
    onReloadResult,
    handleDirectExecute,
    pinnedConnection,
    toast,
}: ResultPanelSaveFlowDeps) {
    const runGuardedExecute = React.useCallback(async (): Promise<boolean> => {
        const script = generatePendingScript();
        if (!script.trim()) return false;

        // Rows in other tables that reference the deleted ones are shown in the
        // same confirmation as the write itself, not in a dialog of their own.
        const notice = await resolveDeleteNotice();
        const guard = await guardSql(script, 'Execute', notice ? { notice } : undefined);
        if (!guard.allowed) {
            if (guard.blockedReason) toast.error(guard.blockedReason);
            return false;
        }

        const effectiveScript = guard.sqlOverride || script;
        const setPendingQueryAuditMeta = getApiGateway().query.setPendingQueryAuditMeta;
        if (guard.auditMeta && setPendingQueryAuditMeta) {
            await setPendingQueryAuditMeta(tabId, guard.auditMeta);
        }

        // A pinned Table/Catalog tab (ADR-0001) must save against its own
        // Pinned Environment, never the ambient Active Environment.
        return handleDirectExecute(async () =>
            unwrapOrThrow(
                pinnedConnection
                    ? await getApiGateway().query.executePinnedUpdateSync(
                          tabId,
                          effectiveScript,
                          pinnedConnection.connectionID,
                          pinnedConnection.dbName,
                          pinnedConnection.environmentKey,
                      )
                    : await getApiGateway().query.executeUpdateSync(tabId, effectiveScript),
            ),
        );
    }, [
        resolveDeleteNotice,
        generatePendingScript,
        guardSql,
        handleDirectExecute,
        pinnedConnection,
        tabId,
        toast,
    ]);

    const handleDirectExecuteRequest = React.useCallback(async () => {
        const didSave = await runGuardedExecute();
        if (didSave && result?.isSelect) {
            onReloadResult();
        }
    }, [onReloadResult, result?.isSelect, runGuardedExecute]);

    const handleSaveRequest = React.useCallback(async () => {
        if (viewMode) {
            toast.error('View Mode is enabled. Write actions are blocked.');
            return;
        }
        if (!hasPendingChanges) return;

        const didSave = await runGuardedExecute();
        if (didSave && result?.isSelect) {
            onReloadResult();
        }
    }, [hasPendingChanges, onReloadResult, result?.isSelect, runGuardedExecute, toast, viewMode]);

    // For "save, then do something else" (the unsaved-changes banner): the caller
    // continues on its own, so no reload here, and it needs to know whether the
    // save really happened.
    const saveWithoutReload = React.useCallback(async (): Promise<boolean> => {
        if (viewMode) {
            toast.error('View Mode is enabled. Write actions are blocked.');
            return false;
        }
        if (!hasPendingChanges) return true;
        return runGuardedExecute();
    }, [hasPendingChanges, runGuardedExecute, toast, viewMode]);

    return {
        handleDirectExecuteRequest,
        handleSaveRequest,
        saveWithoutReload,
    } as const;
}
