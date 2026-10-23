// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';
import type { ToastApi } from '../components/layout/Toast';
import { useAppEventBridge } from '../features/app-runtime/useAppEventBridge';
import { useAppZoom } from '../features/app-runtime/useAppZoom';
import { useBeforeCloseGuard } from '../features/app-runtime/useBeforeCloseGuard';
import { useFeedbackPrompt } from '../features/app-runtime/useFeedbackPrompt';
import { useLogEventBridge } from '../features/app-runtime/useLogEventBridge';
import { useStartupPhase } from '../features/app-runtime/useStartupPhase';
import { useStatsSampler } from '../features/app-runtime/useStatsSampler';
import { useQueryTabAutosave } from '../features/editor';
import { useJobHydration } from '../features/activity';
import { usePluginCommandBridge } from '../lib/plugin/usePluginCommandBridge';
import { useProjectLifecycle } from '../features/project/useProjectLifecycle';
import { useGlobalShortcuts } from '../features/shortcuts/useGlobalShortcuts';
import { useThemeManager } from './useThemeManager';
import { useApiGatewayRuntime } from './useApiGatewayRuntime';
import { useActivityPanelRegistration } from './useActivityPanelRegistration';
import { useTerminalPanelRegistration } from './useTerminalPanelRegistration';

interface UseAppStartupOptions {
    onBeforeClose: () => void;
    toast: ToastApi;
}

export function useAppStartup({ onBeforeClose, toast }: UseAppStartupOptions) {
    useApiGatewayRuntime();
    useBeforeCloseGuard(onBeforeClose);
    useProjectLifecycle();
    useAppEventBridge(toast);
    useLogEventBridge();
    useGlobalShortcuts(toast);
    usePluginCommandBridge();
    useQueryTabAutosave();
    useActivityPanelRegistration();
    useTerminalPanelRegistration();
    useJobHydration();
    useStatsSampler();
    useAppZoom();
    useThemeManager();
    useFeedbackPrompt();

    const handleStartupError = useCallback(
        (message: string) => {
            toast.error(message, {
                important: true,
                source: 'startup.auto-open',
                dedupeKey: 'startup-auto-open',
            });
        },
        [toast],
    );

    return useStartupPhase(handleStartupError);
}
