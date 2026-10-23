// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useState } from 'react';
import { useLayoutStore } from './stores/layoutStore';
import { useProjectStore } from './stores/projectStore';
import { useEnvironmentStore } from './stores/environmentStore';
import { useEditorStore } from './stores/editorStore';
import { useToast } from './components/layout/Toast';
import { PrivacyNoticeDialog } from './components/layout/project/PrivacyNoticeDialog';
import { hasAcceptedPrivacyNotice } from './features/telemetry/privacyNotice';
import { StartupGate } from './components/layout/StartupGate';
import { AppLockOverlay } from './components/layout/AppLockOverlay';
import { TAB_TYPE } from './lib/constants';
import { useSidebarSideState } from './stores/sidebarUiStore';
import { forceQuitWithAutosave } from './features/app-runtime/forceQuitWithAutosave';
import { FEATURE } from './lib/license/entitlementMatrix';
import { useFeatureGate } from './lib/license/useFeatureGate';
import { useAppCommandBus } from './app/useAppCommandBus';
import { AppShell } from './app/AppShell';
import { useAppSecurityState } from './app/useAppSecurityState';
import { useAppStartup } from './app/useAppStartup';
import { useAppDialogState } from './app/useAppDialogState';
import { useEnvironmentTint } from './app/useEnvironmentTint';
import { useNoConnectionNotice } from './app/useNoConnectionNotice';
import { useOnboardingTour } from './features/onboarding/useOnboardingTour';

function App() {
    const showNoConnectionNotice = useNoConnectionNotice();
    const activeProject = useProjectStore(state => state.activeProject);
    useEnvironmentTint();
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const gate = useFeatureGate();
    const resolvedEnvironmentKey = activeEnvironmentKey || activeProject?.default_environment_key;
    const canUseProductionOverlay = gate.canUse(FEATURE.SAFETY_PRODUCTION_OVERLAY);
    const { toast } = useToast();
    const { showSidebar, showRightSidebar, setShowSidebar, setShowRightSidebar } = useLayoutStore();
    const addTab = useEditorStore(state => state.addTab);

    const dialog = useAppDialogState();

    const { width: sidebarWidth, setWidth: setSidebarWidth } = useSidebarSideState('primary');
    const { width: rightSidebarWidth, setWidth: setRightSidebarWidth } =
        useSidebarSideState('secondary');

    const handleOpenSchemaDiff = useCallback(() => {
        addTab({ type: TAB_TYPE.COMPARE, name: 'Schema Diff' });
    }, [addTab]);
    useAppCommandBus({
        activeEnvironmentKey,
        activeProject,
        addCompareTab: handleOpenSchemaDiff,
        setContextSearchIntent: dialog.setContextSearchIntent,
        setProjectHubLaunchIntent: dialog.setProjectHubLaunchIntent,
        setShowProjectHub: dialog.setShowProjectHub,
    });

    const startupPhase = useAppStartup({
        onBeforeClose: () => dialog.setShowForceQuitConfirm(true),
        toast,
    });
    const { appLocked, canUseAppLock, resetActivity } = useAppSecurityState();
    // First-run gate: the privacy notice comes before anything else, so the
    // guided tour waits until it is accepted.
    const [privacyAccepted, setPrivacyAccepted] = useState(() => hasAcceptedPrivacyNotice());
    useOnboardingTour({ enabled: startupPhase === 'ready' && privacyAccepted });

    const handleForceQuitConfirm = useCallback(() => {
        dialog.setShowForceQuitConfirm(false);
        forceQuitWithAutosave().catch(() => {});
    }, []);

    return (
        <>
            <div className='h-full w-full bg-background relative'>
                {startupPhase === 'ready' && (
                    <AppShell
                        canUseProductionOverlay={canUseProductionOverlay}
                        contextSearchIntent={dialog.contextSearchIntent}
                        hasActiveProject={Boolean(activeProject)}
                        showNoConnectionNotice={showNoConnectionNotice}
                        onConfirmForceQuit={handleForceQuitConfirm}
                        projectHubLaunchIntent={dialog.projectHubLaunchIntent}
                        resolvedEnvironmentKey={resolvedEnvironmentKey}
                        rightSidebarWidth={rightSidebarWidth}
                        setContextSearchIntent={dialog.setContextSearchIntent}
                        setProjectHubLaunchIntent={dialog.setProjectHubLaunchIntent}
                        setRightSidebarWidth={setRightSidebarWidth}
                        setShowForceQuitConfirm={dialog.setShowForceQuitConfirm}
                        setShowProjectHub={dialog.setShowProjectHub}
                        setShowRightSidebar={setShowRightSidebar}
                        setShowSidebar={setShowSidebar}
                        setSidebarWidth={setSidebarWidth}
                        showForceQuitConfirm={dialog.showForceQuitConfirm}
                        showProjectHub={dialog.showProjectHub}
                        showRightSidebar={showRightSidebar}
                        showSidebar={showSidebar}
                        sidebarWidth={sidebarWidth}
                    />
                )}
            </div>
            {startupPhase === 'ready' && !privacyAccepted && (
                <PrivacyNoticeDialog onAccept={() => setPrivacyAccepted(true)} />
            )}
            {appLocked && canUseAppLock && <AppLockOverlay onUnlocked={resetActivity} />}
            <StartupGate phase={startupPhase} />
        </>
    );
}

export default App;
