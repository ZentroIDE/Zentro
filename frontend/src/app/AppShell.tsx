// SPDX-License-Identifier: GPL-3.0-only

import { Allotment, LayoutPriority } from 'allotment';
import 'allotment/dist/style.css';
import { QueryTabs } from '../features/editor';
import { ContextSearchDialog } from '../components/layout/ContextSearchDialog';
import { CsvImportDialog } from '../features/data-import';
import { ForceQuitConfirm } from '../components/layout/ForceQuitConfirm';
import { ProjectHub } from '../components/layout/ProjectHub';
import { ProjectWelcome } from '../components/layout/project/ProjectWelcome';
import { useEditorStore } from '../stores/editorStore';
import { StatusBar } from '../components/layout/StatusBar';
import { Toolbar } from '../components/layout/Toolbar';
import { Sidebar } from '../components/layout/Sidebar';
import { SecondarySidebar } from '../components/sidebar/SecondarySidebar';
import { Button } from '../components/ui';
import {
    DOM_EVENT,
    ENVIRONMENT_KEY,
    type ContextSearchIntent,
    type ProjectHubLaunchIntent,
} from '../lib/constants';
import { emitCommand } from '../lib/commandBus';

// Sidebar size bounds — mirror MIN/MAX_WIDTH_BY_SIDE in sidebarUiStore so the
// Allotment sash and the persisted-width clamp agree.
const SIDEBAR_MIN = { primary: 180, secondary: 220 } as const;
const SIDEBAR_MAX = { primary: 800, secondary: 1000 } as const;

interface AppShellProps {
    canUseProductionOverlay: boolean;
    contextSearchIntent: ContextSearchIntent | null;
    hasActiveProject: boolean;
    /** Already decided by `useNoConnectionNotice`: the project has finished
     *  loading and the connection state has settled on there being none.
     *  Deliberately not raw `!isConnected`, which is briefly true during every
     *  project switch and made the notice flash on its way to connecting. */
    showNoConnectionNotice: boolean;
    projectHubLaunchIntent?: ProjectHubLaunchIntent;
    resolvedEnvironmentKey?: string | null;
    rightSidebarWidth: number;
    setContextSearchIntent: (intent: ContextSearchIntent | null) => void;
    setProjectHubLaunchIntent: (intent: ProjectHubLaunchIntent | undefined) => void;
    setRightSidebarWidth: (width: number) => void;
    setShowForceQuitConfirm: (open: boolean) => void;
    setShowProjectHub: (open: boolean) => void;
    setShowRightSidebar: (show: boolean) => void;
    setShowSidebar: (show: boolean) => void;
    setSidebarWidth: (width: number) => void;
    showForceQuitConfirm: boolean;
    showProjectHub: boolean;
    showRightSidebar: boolean;
    showSidebar: boolean;
    sidebarWidth: number;
    onConfirmForceQuit: () => void;
}

export function AppShell({
    canUseProductionOverlay,
    contextSearchIntent,
    hasActiveProject,
    showNoConnectionNotice,
    projectHubLaunchIntent,
    resolvedEnvironmentKey,
    rightSidebarWidth,
    setContextSearchIntent,
    setProjectHubLaunchIntent,
    setRightSidebarWidth,
    setShowForceQuitConfirm,
    setShowProjectHub,
    setShowRightSidebar,
    setShowSidebar,
    setSidebarWidth,
    showForceQuitConfirm,
    showProjectHub,
    showRightSidebar,
    showSidebar,
    sidebarWidth,
    onConfirmForceQuit,
}: AppShellProps) {
    // App-level tabs (settings, shortcuts) can still be open without a project,
    // so Welcome only replaces the editor while there is nothing else to show.
    const hasOpenTabs = useEditorStore(state => state.groups.some(group => group.tabs.length > 0));
    const showWelcome = !hasActiveProject && !hasOpenTabs;

    return (
        <div
            className={`flex flex-col h-full w-full ${canUseProductionOverlay && resolvedEnvironmentKey === ENVIRONMENT_KEY.PRODUCTION ? 'ring-4 ring-destructive/70 ring-inset p-1' : ''}`}
        >
            <CsvImportDialog />
            {contextSearchIntent && (
                <ContextSearchDialog
                    onClose={() => setContextSearchIntent(null)}
                    initialQuery={contextSearchIntent.initialQuery}
                    mode={contextSearchIntent.mode}
                    targetSide={contextSearchIntent.targetSide}
                    compareTabId={contextSearchIntent.compareTabId}
                    initialEnvironmentKey={contextSearchIntent.initialEnvironmentKey}
                    initialSchemaName={contextSearchIntent.initialSchemaName}
                />
            )}
            {showProjectHub && (
                <ProjectHub
                    overlay
                    launchIntent={projectHubLaunchIntent}
                    onClose={() => {
                        setShowProjectHub(false);
                        setProjectHubLaunchIntent(undefined);
                    }}
                />
            )}
            <ForceQuitConfirm
                open={showForceQuitConfirm}
                onCancel={() => setShowForceQuitConfirm(false)}
                onConfirm={onConfirmForceQuit}
            />
            <Toolbar />
            {showNoConnectionNotice && hasActiveProject && (
                <div className='flex items-center justify-center mt-1'>
                    <div className='flex justify-between p-1 px-3 w-4/12 bg-(--alert-info-bg) rounded-md text-label text-muted-foreground shrink-0'>
                        <span>No active connection - switch environment to connect.</span>
                        <Button
                            type='button'
                            variant='link'
                            size='sm'
                            onClick={() => emitCommand(DOM_EVENT.OPEN_ENVIRONMENT_SWITCHER)}
                            className='border-none! h-auto px-0 py-0 text-accent font-semibold'
                        >
                            Configure env
                        </Button>
                    </div>
                </div>
            )}
            <div className='flex flex-1 overflow-hidden m-1'>
                <Allotment
                    proportionalLayout={false}
                    onDragEnd={sizes => {
                        const [left, , right] = sizes;
                        if (left > 0) setSidebarWidth(left);
                        if (right > 0) setRightSidebarWidth(right);
                    }}
                    onVisibleChange={(index, visible) => {
                        if (index === 0) setShowSidebar(visible);
                        if (index === 2) setShowRightSidebar(visible);
                    }}
                >
                    <Allotment.Pane
                        visible={showSidebar}
                        preferredSize={sidebarWidth}
                        minSize={SIDEBAR_MIN.primary}
                        maxSize={SIDEBAR_MAX.primary}
                        snap
                    >
                        <div className='h-full w-full pr-0.5'>
                            <Sidebar />
                        </div>
                    </Allotment.Pane>
                    <Allotment.Pane minSize={360} priority={LayoutPriority.High}>
                        <div className='flex h-full w-full flex-col overflow-hidden px-0.5'>
                            {showWelcome ? <ProjectWelcome /> : <QueryTabs />}
                        </div>
                    </Allotment.Pane>
                    <Allotment.Pane
                        visible={showRightSidebar}
                        preferredSize={rightSidebarWidth}
                        minSize={SIDEBAR_MIN.secondary}
                        maxSize={SIDEBAR_MAX.secondary}
                        snap
                    >
                        <div className='h-full w-full pl-0.5'>
                            <SecondarySidebar />
                        </div>
                    </Allotment.Pane>
                </Allotment>
            </div>
            <StatusBar />
        </div>
    );
}
