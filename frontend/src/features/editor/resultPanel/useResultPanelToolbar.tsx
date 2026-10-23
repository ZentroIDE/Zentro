// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Copy,
    Eye,
    EyeOff,
    Loader,
    Maximize2,
    Minimize2,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Sparkles,
    Trash2,
    Upload,
} from 'lucide-react';
import {
    Button,
    InlineConfirm,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { listResultActionContributions } from '../../../lib/contributionRegistry';
import type { ResultPanelToolbarDeps, ResultPanelAction } from './types';
import type { UiAction } from '../../../types/uiAction';
import { useResultColumnVisibilityAction } from './useResultColumnVisibilityAction';
import { getExecuteActionMeta } from '../../../lib/executeActionMeta';
import { useShortcutHint } from '../../../lib/shortcutDisplay';

const RESULT_TOOLBAR_ICON_SIZE = 12;

export function resolveResultToolbarActionTone(
    action: UiAction & { tone?: 'default' | 'neutral' | 'success' | 'warning' | 'destructive' },
) {
    if (action.tone) return action.tone;

    const normalizedLabel = `${action.label ?? ''} ${action.title ?? ''}`.toLowerCase();
    if (action.danger) return 'destructive' as const;
    if (normalizedLabel.includes('save')) return 'default' as const;
    if (normalizedLabel.includes('add')) return 'success' as const;
    return 'default' as const;
}

export function ToolbarActionItem({
    action,
}: {
    action: UiAction & { tone?: 'default' | 'neutral' | 'success' | 'warning' | 'destructive' };
}) {
    const tone = resolveResultToolbarActionTone(action);
    const [isConfirming, setIsConfirming] = React.useState(false);

    React.useEffect(() => {
        setIsConfirming(false);
    }, [action.disabled]);

    if (action.confirmLabel && isConfirming) {
        return (
            <InlineConfirm
                className='mr-1'
                label={action.confirmLabel}
                confirmTitle={`Yes, ${(action.title || action.label || 'confirm').toLowerCase()}`}
                onConfirm={() => {
                    const res = action.onClick?.();
                    if (res instanceof Promise) res.catch(() => {});
                    setIsConfirming(false);
                }}
                onCancel={() => setIsConfirming(false)}
            />
        );
    }

    const button = (
        <Button
            variant={action.variant || 'ghost'}
            tone={tone}
            size={action.badge ? 'micro' : 'icon'}
            onClick={() => {
                if (action.confirmLabel) {
                    setIsConfirming(true);
                } else {
                    const res = action.onClick?.();
                    if (res instanceof Promise) res.catch(() => {});
                }
            }}
            disabled={action.disabled || action.loading}
            title={action.title || action.label}
            className={cn(
                'h-7 rounded-md p-0',
                action.badge ? 'gap-1 px-2 text-label border' : 'w-7',
                action.className,
            )}
        >
            {action.loading ? (
                <Loader size={RESULT_TOOLBAR_ICON_SIZE} className='animate-spin' />
            ) : (
                <>
                    {action.icon}
                    {action.badge}
                </>
            )}
        </Button>
    );

    if (!action.popoverContent) {
        return button;
    }

    return (
        <Popover open={action.popoverOpen} onOpenChange={action.onPopoverOpenChange}>
            <PopoverTrigger asChild>{button}</PopoverTrigger>
            <PopoverContent className='w-auto min-w-[220px] p-0' align='end' sideOffset={4}>
                {action.popoverContent}
            </PopoverContent>
        </Popover>
    );
}

export function useResultPanelToolbar({
    tabId,
    result,
    onRun,
    environmentKey,
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
    exportRunningSignature,
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
    showBlurToggle,
    screenshotBlurEnabled,
    setScreenshotBlurEnabled,
}: ResultPanelToolbarDeps) {
    const actionsSignatureRef = React.useRef<string>('');
    const runQueryHint = useShortcutHint('editor.runQuery');
    const executeActionMeta = React.useMemo(
        () => getExecuteActionMeta(environmentKey, runQueryHint),
        [environmentKey, runQueryHint],
    );
    const columnsToggleAction = useResultColumnVisibilityAction({
        result,
        columnVisibility,
        setColumnVisibility,
        showColumnsPopover,
        setShowColumnsPopover,
        iconSize: RESULT_TOOLBAR_ICON_SIZE,
    });

    const renderPanelAction = React.useCallback((action: ResultPanelAction) => {
        if (!action.onClick && !action.popoverContent) return null;
        return <ToolbarActionItem key={action.id} action={action} />;
    }, []);

    const panelActions = React.useMemo(() => {
        const actions: ResultPanelAction[] = [];
        const shouldAlwaysShowRowActions = !onActionsChange;
        const showRowActions = canManageDraftRows || shouldAlwaysShowRowActions;
        const rowActionsBlocked = !canManageDraftRows || isSavingDraftRows;
        const rowActionDisabledReason = !canManageDraftRows
            ? 'Row actions require editable table result with primary keys.'
            : undefined;

        if (showRowActions) {
            actions.push({
                id: 'add-row',
                icon: <Plus size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: 'Add Row',
                title: rowActionDisabledReason || 'Add Row',
                tone: 'success',
                onClick: handleAddRow,
                disabled: rowActionsBlocked,
            });
            actions.push({
                id: 'duplicate-rows',
                icon: <Copy size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: 'Duplicate',
                title: rowActionDisabledReason || 'Duplicate Selected Rows',
                onClick: handleDuplicateRows,
                disabled: rowActionsBlocked || selectedPersistedRowIndices.length === 0,
            });
            actions.push({
                id: 'delete-rows',
                icon: <Trash2 size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: 'Delete',
                title: rowActionDisabledReason || 'Delete Selected Rows',
                danger: true,
                tone: 'destructive',
                onClick: requestDeleteSelectedRows,
                disabled:
                    rowActionsBlocked ||
                    (selectedPersistedRowIndices.length === 0 && selectedDraftIds.length === 0),
            });
        }

        if (hasPendingChanges) {
            actions.push({
                id: 'discard',
                icon: <RotateCcw size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: 'Discard',
                title: 'Discard',
                danger: true,
                tone: 'destructive',
                confirmLabel: 'Discard?',
                onClick: () => {
                    resetEditState();
                    setSelectedCells(new Set());
                },
            });
            if (!viewMode) {
                actions.push({
                    id: 'save',
                    icon: <Save size={RESULT_TOOLBAR_ICON_SIZE} />,
                    label: 'Save',
                    title: 'Save',
                    tone: 'default',
                    onClick: () => {
                        void handleSaveRequest();
                    },
                    loading: isSavingDraftRows,
                });
            }
        }

        const resultActionContext = {
            tabId,
            rowCount: result?.rows.length || 0,
            columnCount: result?.columns.length || 0,
        };
        const extensionActions = listResultActionContributions()
            .filter(contribution =>
                contribution.isAvailable ? contribution.isAvailable(resultActionContext) : true,
            )
            .map<ResultPanelAction>(contribution => ({
                id: `ext:${contribution.id}`,
                icon: <Sparkles size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: contribution.title,
                title: contribution.title,
                onClick: () => contribution.run(resultActionContext),
            }));
        actions.push(...extensionActions);

        if (columnsToggleAction) {
            actions.push(columnsToggleAction);
        }

        if (onRun) {
            actions.push({
                id: 'reload',
                icon: <RefreshCw size={RESULT_TOOLBAR_ICON_SIZE} />,
                label: 'Reload',
                title: 'Reload',
                onClick: () => {
                    void onRun();
                },
                loading: Boolean(result && !result.isDone),
            });
        }

        if (showBlurToggle) {
            actions.push({
                id: 'blur-sensitive-columns',
                icon: screenshotBlurEnabled ? (
                    <EyeOff size={RESULT_TOOLBAR_ICON_SIZE} />
                ) : (
                    <Eye size={RESULT_TOOLBAR_ICON_SIZE} />
                ),
                label: 'Blur sensitive columns',
                title: screenshotBlurEnabled
                    ? 'Disable blur for sensitive columns'
                    : 'Blur visible sensitive columns',
                onClick: () => setScreenshotBlurEnabled(!screenshotBlurEnabled),
                disabled: !canUseScreenshotBlur,
                signature: `blur:${screenshotBlurEnabled ? 1 : 0}:${canUseScreenshotBlur ? 1 : 0}`,
            });
        }

        actions.push({
            id: 'export',
            icon: <Upload size={RESULT_TOOLBAR_ICON_SIZE} />,
            label: 'Export',
            title: 'Export',
            onClick: handleOpenExportModal,
            disabled: !canUseResultExport,
        });

        if (showMaximizeControl) {
            actions.push({
                id: 'toggle-maximize',
                icon: isMaximized ? (
                    <Minimize2 size={RESULT_TOOLBAR_ICON_SIZE} />
                ) : (
                    <Maximize2 size={RESULT_TOOLBAR_ICON_SIZE} />
                ),
                title: isMaximized ? 'Restore result panel size' : 'Maximize result panel',
                onClick: onToggleMaximize,
                disabled: !onToggleMaximize,
                signature: `maximize:${isMaximized ? 1 : 0}:${onToggleMaximize ? 1 : 0}`,
            });
        }

        if (exportRunningSignature) {
            actions.push({
                id: 'cancel-export',
                icon: <Loader size={RESULT_TOOLBAR_ICON_SIZE} className='animate-spin' />,
                title: 'Cancel export',
                danger: true,
                tone: 'destructive',
                confirmLabel: 'Cancel export?',
                onClick: cancelExport,
                signature: exportRunningSignature,
            });
        }

        return actions;
    }, [
        canManageDraftRows,
        isSavingDraftRows,
        handleAddRow,
        handleDuplicateRows,
        requestDeleteSelectedRows,
        hasPendingChanges,
        resetEditState,
        setSelectedCells,
        viewMode,
        handleSaveRequest,
        tabId,
        result?.rows.length,
        result?.columns.length,
        result?.isDone,
        executeActionMeta.title,
        executeActionMeta.tone,
        executeActionMeta.variant,
        columnsToggleAction,
        canUseScreenshotBlur,
        showBlurToggle,
        screenshotBlurEnabled,
        setScreenshotBlurEnabled,
        handleOpenExportModal,
        canUseResultExport,
        showMaximizeControl,
        isMaximized,
        onToggleMaximize,
        exportRunningSignature,
        cancelExport,
        onRun,
        onActionsChange,
        selectedPersistedRowIndices.length,
        selectedDraftIds.length,
        result,
        environmentKey,
    ]);

    React.useEffect(() => {
        if (!onActionsChange) return;
        const signature = panelActions
            .map(
                action =>
                    `${action.id}:${action.disabled ? 1 : 0}:${action.loading ? 1 : 0}:${action.danger ? 1 : 0}:${action.label || ''}:${action.title || ''}:${action.signature || ''}:${action.popoverContent ? 1 : 0}:${action.popoverOpen ? 1 : 0}`,
            )
            .join('|');
        if (actionsSignatureRef.current === signature) return;
        actionsSignatureRef.current = signature;
        onActionsChange(panelActions);
    }, [onActionsChange, panelActions]);

    return {
        panelActions,
        renderPanelAction,
    };
}
