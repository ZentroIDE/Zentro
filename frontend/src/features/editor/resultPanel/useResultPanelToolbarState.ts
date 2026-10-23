// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { FEATURE } from '../../../lib/license/entitlementMatrix';
import { reportFeatureUsage } from '../../../lib/license/featureUsage';
import { usePIIDetection } from './usePIIDetection';
import { useExportState } from './useExportState';
import { useResultPanelToolbar } from './useResultPanelToolbar';
import type { ResultPanelAction, ResultPanelProps } from './types';

interface UseResultPanelToolbarStateOptions {
    tabId: string;
    result: ResultPanelProps['result'];
    activeEnvironmentKey: string | null;
    onActionsChange?: (actions: ResultPanelAction[]) => void;
    canManageDraftRows: boolean;
    isSavingDraftRows: boolean;
    hasPendingChanges: boolean;
    viewMode: boolean;
    selectedPersistedRowIndices: number[];
    selectedDraftIds: string[];
    showMaximizeControl: boolean;
    isMaximized: boolean;
    onToggleMaximize?: () => void;
    handleAddRow: () => void;
    handleDuplicateRows: () => void;
    requestDeleteSelectedRows: () => void;
    resetEditState: () => void;
    setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
    handleSaveRequest: () => Promise<void>;
    screenshotBlurEnabled: boolean;
    setScreenshotBlurEnabled: (enabled: boolean) => void;
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    showColumnsPopover: boolean;
    setShowColumnsPopover: React.Dispatch<React.SetStateAction<boolean>>;
    runExport: ReturnType<
        typeof import('../../../features/editor/useResultExport').useResultExport
    >['runExport'];
    exportJob: ReturnType<
        typeof import('../../../features/editor/useResultExport').useResultExport
    >['exportJob'];
    cancelExport: () => void;
    toast: {
        error: (message: string) => void;
        success: (message: string) => void;
        info: (message: string) => void;
    };
    featureGate: { canUse: (feature: string) => boolean; isTrial: boolean };
    onRun?: () => void;
}

export function useResultPanelToolbarState({
    tabId,
    result,
    activeEnvironmentKey,
    onActionsChange,
    canManageDraftRows,
    isSavingDraftRows,
    hasPendingChanges,
    viewMode,
    selectedPersistedRowIndices,
    selectedDraftIds,
    showMaximizeControl,
    isMaximized,
    onToggleMaximize,
    handleAddRow,
    handleDuplicateRows,
    requestDeleteSelectedRows,
    resetEditState,
    setSelectedCells,
    handleSaveRequest,
    screenshotBlurEnabled,
    setScreenshotBlurEnabled,
    columnVisibility,
    setColumnVisibility,
    showColumnsPopover,
    setShowColumnsPopover,
    runExport,
    exportJob,
    cancelExport,
    toast,
    featureGate,
    onRun,
}: UseResultPanelToolbarStateOptions) {
    const canUseResultExport = featureGate.canUse(FEATURE.QUERY_RESULT_EXPORT);
    const canUseResultSearch = featureGate.canUse(FEATURE.QUERY_RESULT_SEARCH);
    const canUseResultJump = featureGate.canUse(FEATURE.QUERY_RESULT_JUMP);
    const canUseScreenshotBlur = featureGate.canUse(FEATURE.SECURITY_SCREENSHOT_BLUR);

    const handleSetScreenshotBlurEnabled = (enabled: boolean) => {
        if (enabled) {
            reportFeatureUsage(featureGate.isTrial, FEATURE.SECURITY_SCREENSHOT_BLUR);
        }
        setScreenshotBlurEnabled(enabled);
    };

    const canUsePIIDetection = featureGate.canUse(FEATURE.SECURITY_PII_DETECTION);
    const { blurredColumnIndexes, setColumnBlurOverride, hasPII } = usePIIDetection({
        result,
        canUsePIIDetection,
        canUseScreenshotBlur,
        screenshotBlurEnabled,
    });

    const exportState = useExportState({ result, blurredColumnIndexes, runExport, toast });
    const {
        showExportModal,
        setShowExportModal,
        exportScope,
        setExportScope,
        exportFormat,
        setExportFormat,
        exportTableName,
        setExportTableName,
        allExportColumns,
        orderedSelectedExportColumns,
        areAllExportColumnsSelected,
        previewExportRows,
        blurredExportColumns,
        hasBlurredExportColumns,
        includeBlurredColumns,
        setIncludeBlurredColumns,
        toggleExportColumn,
        toggleAllExportColumns,
        handleConfirmExport,
        handleOpenExportModal,
    } = exportState;

    useEffect(() => {
        if (canUsePIIDetection && hasPII) {
            reportFeatureUsage(featureGate.isTrial, FEATURE.SECURITY_PII_DETECTION);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canUsePIIDetection, hasPII]);

    const { panelActions, renderPanelAction } = useResultPanelToolbar({
        tabId,
        result,
        onRun,
        environmentKey: activeEnvironmentKey,
        onActionsChange,
        canManageDraftRows,
        isSavingDraftRows,
        hasPendingChanges,
        viewMode,
        selectedPersistedRowIndices,
        selectedDraftIds,
        canUseResultExport,
        showMaximizeControl,
        isMaximized,
        onToggleMaximize,
        exportRunningSignature:
            exportJob?.status === 'running'
                ? `export-running:${exportJob.progressPct ?? 0}`
                : undefined,
        handleAddRow,
        handleDuplicateRows,
        requestDeleteSelectedRows,
        resetEditState,
        setSelectedCells,
        handleSaveRequest,
        handleOpenExportModal,
        cancelExport,
        columnVisibility,
        setColumnVisibility,
        showColumnsPopover,
        setShowColumnsPopover,
        canUseScreenshotBlur,
        showBlurToggle: Boolean(hasPII || screenshotBlurEnabled),
        screenshotBlurEnabled,
        setScreenshotBlurEnabled: handleSetScreenshotBlurEnabled,
    });

    return {
        canUseResultSearch,
        canUseResultJump,
        canUseScreenshotBlur,
        exportJob,
        blurredColumnIndexes,
        setColumnBlurOverride,
        panelActions,
        renderPanelAction,
        showExportModal,
        setShowExportModal,
        exportScope,
        setExportScope,
        exportFormat,
        setExportFormat,
        exportTableName,
        setExportTableName,
        allExportColumns,
        orderedSelectedExportColumns,
        areAllExportColumnsSelected,
        previewExportRows,
        blurredExportColumns,
        hasBlurredExportColumns,
        includeBlurredColumns,
        setIncludeBlurredColumns,
        toggleExportColumn,
        toggleAllExportColumns,
        handleConfirmExport,
        handleOpenExportModal,
    } as const;
}
