// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { setClipboardText } from '../../../services/clipboardService';
import { withSchemaContextHint } from '../../../lib/schemaErrorHint';
import { useWriteSafetyGuard } from '../../../lib/writeSafety/useWriteSafetyGuard';
import type { ResultPanelEnvironmentDeps } from './types';

export function useResultPanelEnvironment({
    activeEnvironmentKey,
    activeProject,
    result,
    addTab,
    toast,
}: ResultPanelEnvironmentDeps) {
    // Caller already resolved Pinned Environment (ADR-0001) precedence —
    // activeEnvironmentKey here is a Table tab's pin when one exists.
    const effectiveEnvironmentKey = activeEnvironmentKey;
    const handleCopyScript = React.useCallback(
        (script: string) => {
            void setClipboardText(script)
                .then(() => toast.success('Script copied to clipboard'))
                .catch(() => toast.error('Failed to copy script'));
        },
        [toast],
    );

    const handleOpenInNewTab = React.useCallback(
        (script: string) => {
            addTab({
                name: `Apply ${result?.tableName}`,
                query: script,
            });
            toast.success('Script opened in a new tab.');
        },
        [addTab, result?.tableName, toast],
    );

    const writeSafetyGuardOptions = React.useMemo(
        () => ({ onCopyScript: handleCopyScript, onOpenScriptInNewTab: handleOpenInNewTab }),
        [handleCopyScript, handleOpenInNewTab],
    );
    const { guardSql, modals: writeSafetyModals } = useWriteSafetyGuard(
        effectiveEnvironmentKey ?? undefined,
        writeSafetyGuardOptions,
    );

    const currentEnvironment = React.useMemo(() => {
        if (!activeProject || !effectiveEnvironmentKey) return null;
        return (
            activeProject.environments?.find(
                environment => environment.key === effectiveEnvironmentKey,
            ) || null
        );
    }, [effectiveEnvironmentKey, activeProject]);

    const resultErrorMessage = React.useMemo(
        () =>
            withSchemaContextHint(
                result?.error,
                currentEnvironment?.last_schema ?? undefined,
                result?.lastExecutedQuery,
            ),
        [currentEnvironment?.last_schema, result?.error, result?.lastExecutedQuery],
    );

    return {
        guardSql,
        writeSafetyModals,
        resultErrorMessage,
    } as const;
}
