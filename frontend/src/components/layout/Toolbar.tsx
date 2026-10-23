// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useState } from 'react';
import {
    Settings,
    Lock,
    LockKeyhole,
    Eye,
    RefreshCw,
    Search,
    GitBranch,
    PanelLeft,
    PanelBottom,
    PanelRight,
    Layers,
    BookText,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useProjectStore } from '../../stores/projectStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useShortcutStore } from '../../stores/shortcutStore';
import { useSchemaStore, type SchemaNode } from '../../stores/schemaStore';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../../wailsjs/runtime/runtime';

import { AboutModal } from './AboutModal';
import { UpdateModal } from './UpdateModal';
import { LicenseModal } from './LicenseModal';
import { TipOfTheDayDialog } from '../../features/onboarding/TipOfTheDayDialog';
import {
    shouldShowTipsOnStartup,
    hasShownTipToday,
    markTipShownToday,
} from '../../features/onboarding/tipOfTheDayFlag';
import { hasCompletedOnboardingTour } from '../../features/onboarding/onboardingTourFlag';
import { useToast } from './Toast';
import { EditorSchemaSelect } from '../../features/editor';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { cn } from '../../lib/cn';
import { hexToRgba, resolveProjectColor } from '../../lib/projectColors';
import type { CommandId } from '../../lib/shortcutRegistry';
import { SECURITY_COMMAND } from '../../lib/shortcutRegistry';
import { formatBindingForDisplay } from '../../lib/shortcutDisplay';
import { Badge, Button } from '../ui';
import zentroLogo from '../../assets/images/appicon.png';
import { DOM_EVENT, CONNECTION_STATUS } from '../../lib/constants';
import type { EnvironmentKey } from '../../types/project';
import { emitCommand } from '../../lib/commandBus';
import { ToolbarSlot } from '../../lib/plugin/ToolbarSlot';
import { WindowControls } from './toolbar/WindowControls';
import { AppMenu } from './toolbar/AppMenu';
import { QuickEnvPopover } from './toolbar/QuickEnvPopover';
import { QuickProjectPopover } from './toolbar/QuickProjectPopover';
import { ConnectionInfoHoverCard } from './toolbar/ConnectionInfoHoverCard';
import { ToolbarUpdateButton } from './toolbar/ToolbarUpdateButton';
import { useReconnectLogic } from './toolbar/useReconnectLogic';
import { useViewModeToggle } from './toolbar/useViewModeToggle';
import { useGitBranchLogic } from './toolbar/useGitBranchLogic';
import { usePlatform } from '../../hooks/usePlatform';
import { FEATURE } from '../../lib/license/entitlementMatrix';
import { reportFeatureUsage } from '../../lib/license/featureUsage';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { useSecurityStore } from '../../stores/securityStore';
import { resolvePreferredSchemaName } from './schemaContext';

const EMPTY_SCHEMA_TREE: SchemaNode[] = [];

export const Toolbar: React.FC = () => {
    const platform = usePlatform();
    const { activeProfile, connectionStatus, isConnected } = useConnectionStore();
    const { toast } = useToast();
    const activeProject = useProjectStore(s => s.activeProject);
    const setEnvironmentLastSchema = useProjectStore(s => s.setEnvironmentLastSchema);
    const activeEnvironmentKey = useEnvironmentStore(s => s.activeEnvironmentKey);
    const { addTab } = useEditorStore();
    const {
        showSidebar,
        showResultPanel,
        showRightSidebar,
        toggleSidebar,
        toggleResultPanel,
        toggleRightSidebar,
    } = useLayoutStore();
    const gate = useFeatureGate();
    const canUseAppLock = gate.canUse(FEATURE.SECURITY_APP_LOCK);
    const planLabel = gate.isEnterprise
        ? 'Enterprise'
        : gate.isTeam
          ? 'Team'
          : gate.isPro || gate.isTrial
            ? 'Pro'
            : 'Free';
    const isPaidPlan = planLabel !== 'Free';
    const appLockEnabled = useSecurityStore(state => state.app_lock_enabled);
    const appLockConfigured = useSecurityStore(state => state.app_lock_configured);
    const appLocked = useSecurityStore(state => state.app_locked);
    const lockApp = useSecurityStore(state => state.lockApp);
    const shortcutBindings = useShortcutStore(s => s.bindings);
    const getShortcutBinding = useShortcutStore(s => s.getBinding);
    const resolveShortcutBinding = useCallback(
        (id: CommandId) => {
            const raw =
                typeof getShortcutBinding === 'function'
                    ? getShortcutBinding(id)
                    : shortcutBindings?.[id] || '';
            return formatBindingForDisplay(raw, platform);
        },
        [getShortcutBinding, shortcutBindings, platform],
    );

    const {
        hasUpdate,
        updateInfo,
        currentVersion,
        dismiss,
        check,
        isChecking,
        canAutoUpdate,
        isNightly,
        restartAndUpdate,
        isApplying,
        updateError,
        updatedToVersion,
    } = useUpdateCheck();

    // A failed check, download, verify, or install all land in updateError;
    // without this they were silent. Toast it so a broken auto-update is at
    // least visible.
    React.useEffect(() => {
        if (updateError) {
            toast.error(`Update failed: ${updateError}`);
        }
    }, [updateError, toast]);

    // The one feedback loop for a Windows update: the helper that (maybe)
    // relaunched this process reported success on its way out.
    React.useEffect(() => {
        if (updatedToVersion) {
            toast.success(`Updated to v${updatedToVersion}.`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updatedToVersion]);

    const [aboutOpen, setAboutOpen] = useState(false);
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [licenseOpen, setLicenseOpen] = useState(false);
    const [tipOfTheDayOpen, setTipOfTheDayOpen] = useState(false);
    const schemaPersistRef = React.useRef('');

    // Only auto-show once the one-time onboarding tour has already run (or
    // been skipped) in a previous session, so a brand-new install doesn't get
    // both the tour overlay and this dialog competing for attention at once.
    // Also capped at once per calendar day — this effect reruns on every
    // reload/relaunch, not just once ever, so without the date check it would
    // pop up every single time the app (re)starts.
    React.useEffect(() => {
        if (hasCompletedOnboardingTour() && shouldShowTipsOnStartup() && !hasShownTipToday()) {
            setTipOfTheDayOpen(true);
            markTipShownToday();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { viewMode, handleToggleViewMode } = useViewModeToggle();
    const { handleReconnect, canReconnect, isConnecting } = useReconnectLogic();
    const { hasGitRepo, gitBranch, gitBranchLoading } = useGitBranchLogic();

    // Active tab detection for menu
    const { groups, activeGroupId } = useEditorStore();
    const activeGroup = groups.find(g => g.id === activeGroupId);
    const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);

    const projectColorOption = resolveProjectColor(activeProject);
    // Translucent tint spans the whole project+server/db zone rather than a
    // solid fill on just the chip, so the project color reads as an ambient
    // wash instead of a heavy block — default text/icon colors stay legible
    // on top without needing a white-text override.
    const projectZoneStyle: React.CSSProperties | undefined = projectColorOption
        ? { backgroundColor: hexToRgba(projectColorOption.value, 0.6) }
        : undefined;
    const activeEnvKey = (activeEnvironmentKey || activeProject?.default_environment_key) as
        | EnvironmentKey
        | undefined;
    const isDebugMode = import.meta.env.DEV;

    // ADR-0001 (docs/adr/0001-pinned-environment-context-for-data-tabs.md):
    // this zone's Server/DB/Schema + env switcher represent the Active
    // Environment — the execution target for Query tabs only. A focused
    // Table/Catalog tab has its own Pinned Environment (see the tab's own
    // badge) that never changes with this zone, so dim it rather than let
    // it look like it still describes what's on screen.
    const isPinnedContextTabFocused = activeTab?.type === 'table' || activeTab?.type === 'catalog';
    const pinnedContextTabTitle = isPinnedContextTabFocused
        ? 'This table is pinned to its own environment (see the badge on its tab) — independent of the switcher below.'
        : undefined;

    const schemaTreeKey = React.useMemo(() => {
        const profileName = activeProfile?.name || '';
        const dbName = activeProfile?.db_name || '';
        return profileName && dbName ? `${profileName}:${dbName}` : '';
    }, [activeProfile?.db_name, activeProfile?.name]);

    const schemaTree = useSchemaStore(state =>
        schemaTreeKey ? (state.trees[schemaTreeKey] ?? EMPTY_SCHEMA_TREE) : EMPTY_SCHEMA_TREE,
    );
    const schemaLoading = useSchemaStore(state =>
        schemaTreeKey ? state.loadingKeys.has(schemaTreeKey) : false,
    );

    const targetEnvironmentKey =
        activeEnvironmentKey ||
        activeProject?.last_active_environment_key ||
        activeProject?.default_environment_key;

    const currentEnvironment = React.useMemo(() => {
        if (!activeProject || !targetEnvironmentKey) return null;
        return (
            activeProject.environments?.find(
                environment => environment.key === targetEnvironmentKey,
            ) || null
        );
    }, [targetEnvironmentKey, activeProject]);

    const currentSchema = currentEnvironment?.last_schema?.trim() || '';

    const availableSchemas = React.useMemo(
        () =>
            schemaTree
                .map(schema => schema.Name)
                .filter(Boolean)
                .sort((left, right) => left.localeCompare(right)),
        [schemaTree],
    );
    const effectiveSchema = React.useMemo(
        () => resolvePreferredSchemaName(availableSchemas, currentSchema),
        [availableSchemas, currentSchema],
    );

    const canChangeSchema = Boolean(isConnected && activeProject && targetEnvironmentKey);

    const handleSchemaChange = async (value: string) => {
        if (!activeProject || !targetEnvironmentKey) return;
        const savedProject = await useProjectStore
            .getState()
            .setEnvironmentLastSchema(targetEnvironmentKey, value);
        if (!savedProject) {
            toast.error('Could not update schema context.');
        }
    };

    React.useEffect(() => {
        if (!canChangeSchema || schemaLoading || !effectiveSchema || !targetEnvironmentKey) return;
        if (effectiveSchema === currentSchema) return;

        const persistKey = `${targetEnvironmentKey}:${effectiveSchema}`;
        if (schemaPersistRef.current === persistKey) return;
        schemaPersistRef.current = persistKey;

        void setEnvironmentLastSchema(targetEnvironmentKey, effectiveSchema)
            .then(savedProject => {
                if (savedProject) return;
                schemaPersistRef.current = '';
                toast.error('Could not update schema context.');
            })
            .catch(() => {
                schemaPersistRef.current = '';
                toast.error('Could not update schema context.');
            });
    }, [
        canChangeSchema,
        currentSchema,
        effectiveSchema,
        setEnvironmentLastSchema,
        schemaLoading,
        targetEnvironmentKey,
        toast,
    ]);

    const handleToolbarDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (
            target.closest(
                'button, a, input, textarea, select, [role="button"], [data-no-window-dblclick="true"]',
            )
        ) {
            return;
        }
        WindowToggleMaximise();
    };

    const isMac = platform === 'darwin';

    const openFeedbackSettings = () => {
        addTab({ type: 'settings', name: 'Settings', content: 'settings-feedback' });
        // Covers the tab-already-open case: addTab above only seeds the
        // initial section for a freshly created tab, since reusing an
        // existing settings tab doesn't update its stored `content`.
        emitCommand(DOM_EVENT.OPEN_SETTINGS_SECTION, { section: 'settings-feedback' });
    };

    return (
        <div
            className='relative grid grid-cols-10 items-center pt-1'
            // The grid spans the full toolbar width so the center track
            // (cols 4–7 of 10) stays optically centered on the window. The
            // platform chrome insets — the mac traffic lights on the left,
            // the absolutely-positioned WindowControls (3 × 46px) on the
            // right for non-mac — are applied to the Left/Right cluster
            // children below, never on this root, so they can't shift the
            // grid (and with it the center track) off-centre.
            style={
                {
                    '--wails-draggable': 'drag',
                    cursor: 'default',
                } as React.CSSProperties & Record<'--wails-draggable', string>
            }
            onDoubleClick={handleToolbarDoubleClick}
        >
            {/* Left: 3/10 */}
            <div
                className='col-span-3 min-w-0 flex items-center ml-1'
                // mac insets past the traffic lights here (not on the grid
                // root) so the reservation never pushes the center track right.
                style={isMac ? { paddingLeft: '76px' } : undefined}
            >
                <div
                    className='flex items-center gap-1.5'
                    style={
                        { '--wails-draggable': 'no-drag' } as React.CSSProperties &
                            Record<'--wails-draggable', string>
                    }
                >
                    <AppMenu
                        trigger={
                            <img src={zentroLogo} alt='Zentro' className='w-5 h-5 object-contain' />
                        }
                        hasUpdate={hasUpdate}
                        isChecking={isChecking}
                        check={check}
                        dismiss={dismiss}
                        onOpenAbout={() => setAboutOpen(true)}
                        onOpenLicense={() => setLicenseOpen(true)}
                        onOpenTipOfTheDay={() => setTipOfTheDayOpen(true)}
                        onOpenUpdateModal={setUpdateModalOpen}
                    />
                    {isNightly && (
                        <Badge variant='warning' title='This is a nightly build'>
                            Nightly
                        </Badge>
                    )}
                    <Button
                        variant='ghost'
                        size='icon'
                        title={
                            viewMode
                                ? 'View Mode ON (Click to disable)'
                                : 'Enable View Mode (Read-only)'
                        }
                        aria-pressed={viewMode}
                        className={cn('relative', viewMode && 'text-warning')}
                        onClick={() => {
                            void handleToggleViewMode();
                        }}
                    >
                        {viewMode ? <Eye size={14} className='glow-warning' /> : <Lock size={14} />}
                        {viewMode && (
                            <span className='absolute top-1 right-1 h-1.5 w-1.5 rounded-sm bg-warning animate-pulse' />
                        )}
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        title='Reload Connection'
                        onClick={() => {
                            void handleReconnect();
                        }}
                        disabled={!canReconnect}
                    >
                        <RefreshCw size={14} className={cn(isConnecting && 'animate-spin')} />
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        title='View Scripts'
                        onClick={() =>
                            emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, { initialQuery: '# ' })
                        }
                    >
                        <BookText size={14} />
                    </Button>
                    {canUseAppLock && appLockEnabled && appLockConfigured && (
                        <Button
                            variant='ghost'
                            size='icon'
                            title={`Lock App (${resolveShortcutBinding(SECURITY_COMMAND.LOCK_APP)})`}
                            disabled={appLocked}
                            onClick={() => {
                                reportFeatureUsage(gate.isTrial, FEATURE.SECURITY_APP_LOCK);
                                void lockApp();
                            }}
                        >
                            <LockKeyhole size={14} />
                        </Button>
                    )}
                    {hasGitRepo && (
                        <Button
                            variant='ghost'
                            size='sm'
                            className='text-label'
                            title='Switch or create branch'
                            onClick={() =>
                                emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, {
                                    initialQuery: '@git ',
                                })
                            }
                        >
                            <GitBranch size={14} />
                            <span className='max-w-30 truncate'>
                                {gitBranchLoading ? 'loading...' : gitBranch || '-'}
                            </span>
                        </Button>
                    )}
                    {isDebugMode && (
                        <span
                            title='Visible only while the app is running in development mode.'
                            className='debug-mode-badge inline-flex h-6 shrink-0 items-center justify-center rounded-md px-2 text-label font-semibold tracking-[0.02em] leading-none'
                        >
                            Debug Mode
                        </span>
                    )}
                    <ToolbarSlot slot='toolbar-left' />
                </div>
            </div>

            {/* Center: 5/10 below xl, 6/10 from xl up. The app's MinWidth (1224px, see
                main.go) sits above Tailwind's lg breakpoint (1024px), so lg: classes are
                always active in-app and never toggle — xl (1280px) is the first breakpoint
                that actually straddles the achievable window-width range. Zones: project
                (1/6) / server+db (4/6, flows in the middle track instead of
                position:absolute — avoids overlapping the project/env zones when
                server/db text is long) / env zone (1/6) */}
            <div
                className={cn(
                    'relative col-span-4 xl:col-span-4 grid-cols-6 min-w-0 flex items-center justify-between text-white h-6 shrink-0 rounded-sm text-label',
                )}
                // The root sets --wails-draggable: drag and it inherits; this
                // zone is all interactive (project / server-db / env), so opt
                // the whole cluster back out or its controls need two clicks.
                style={
                    {
                        '--wails-draggable': 'no-drag',
                        ...projectZoneStyle,
                    } as React.CSSProperties & Record<'--wails-draggable', string>
                }
            >
                {connectionStatus === CONNECTION_STATUS.CONNECTING && (
                    <span aria-hidden className='toolbar-connecting-progress-track' />
                )}
                {/* Project zone — col-span-1 of 6, mirrors the env zone's width */}
                <div
                    className='col-span-1 flex min-w-0 items-center gap-1'
                    data-tour='toolbar-project'
                >
                    <QuickProjectPopover />
                </div>

                {/* Server + DB + Schema — normal grid child in the middle track, centered
                    via justify-center. No longer position:absolute: with long host/db names
                    it used to be able to visually overlap the project button or env badge
                    since absolute content isn't measured against its siblings; as a grid
                    track it now truncates within its own bounded width instead. */}
                <div
                    data-testid='toolbar-active-environment-zone'
                    data-tour='toolbar-connection'
                    className={cn(
                        'col-span-4 flex items-center justify-center transition-all duration-fast',
                        isPinnedContextTabFocused && 'opacity-45',
                    )}
                    title={pinnedContextTabTitle}
                >
                    <ConnectionInfoHoverCard />
                    {isConnected && (schemaLoading || availableSchemas.length > 0) && (
                        <>
                            <span
                                className={cn(
                                    projectColorOption
                                        ? 'text-white/40'
                                        : 'text-muted-foreground/30',
                                )}
                            >
                                /
                            </span>
                            <EditorSchemaSelect
                                availableSchemas={availableSchemas}
                                canChangeSchema={canChangeSchema}
                                currentSchema={effectiveSchema}
                                onSchemaChange={handleSchemaChange}
                                env={activeEnvKey}
                                loading={schemaLoading}
                            />
                        </>
                    )}
                </div>
                {/* Env zone — col-span-1 of 6, mirrors the project zone's width */}
                <div
                    className={cn(
                        'col-span-1 flex items-center justify-end transition-opacity duration-fast',
                        isPinnedContextTabFocused && 'opacity-45',
                    )}
                    title={pinnedContextTabTitle}
                    data-tour='toolbar-environment'
                >
                    <QuickEnvPopover />
                </div>
            </div>

            {/* Right: 2/10, pinned to the last two columns so it stays anchored to the
                true right edge even when the center zone shrinks to 5/10 on small screens */}
            <div
                className='col-start-9 col-span-2 min-w-0 flex items-center justify-end'
                // Reserve the top-right corner for the absolutely-positioned
                // WindowControls (3 × 46px) on non-mac here (not on the grid
                // root) so the center track stays centered on the window; the
                // justify-end content just ends 138px before the edge.
                style={isMac ? { cursor: 'default' } : { cursor: 'default', paddingRight: '138px' }}
            >
                <div
                    className='flex items-center gap-1'
                    // Opt this control cluster (incl. WindowControls) out of the
                    // root's inherited --wails-draggable: drag — otherwise the
                    // first click only starts a window drag.
                    style={
                        { '--wails-draggable': 'no-drag' } as React.CSSProperties &
                            Record<'--wails-draggable', string>
                    }
                >
                    <Button
                        variant='ghost'
                        className='hidden xl:inline-flex'
                        title='Send feedback or report an issue'
                        onClick={openFeedbackSettings}
                    >
                        Feedback
                    </Button>
                    <Button
                        variant='ghost'
                        title={`${planLabel} plan — click to manage license`}
                        className={cn(
                            isPaidPlan ? 'text-success! font-semibold bg-transparent!' : '',
                        )}
                        onClick={() => setLicenseOpen(true)}
                    >
                        {planLabel}
                    </Button>
                    <ToolbarUpdateButton
                        currentVersion={currentVersion}
                        updateInfo={updateInfo}
                        isApplying={isApplying}
                        isNightly={isNightly}
                        onOpenDetails={() => setUpdateModalOpen(true)}
                    />
                    <Button
                        variant='ghost'
                        size='icon'
                        className={cn(
                            activeTab?.type === 'settings' && 'ui-interactive-selected',
                            'border-none! bg-transparent!',
                        )}
                        title='Settings'
                        data-tour='settings-button'
                        onClick={() => addTab({ type: 'settings', name: 'Settings' })}
                    >
                        <Settings size={14} strokeWidth={activeTab?.type === 'settings' ? 3 : 2} />
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        className={cn(
                            showSidebar && 'ui-interactive-selected',
                            'border-none! bg-transparent!',
                        )}
                        title={`Toggle Sidebar (${resolveShortcutBinding('layout.toggleSidebar')})`}
                        onClick={toggleSidebar}
                    >
                        <PanelLeft size={14} strokeWidth={showSidebar ? 2.5 : 2} />
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        className={cn(
                            showResultPanel && 'ui-interactive-selected',
                            'border-none! bg-transparent!',
                        )}
                        title={`Toggle Result Panel (${resolveShortcutBinding('layout.toggleResultPanel')})`}
                        onClick={toggleResultPanel}
                    >
                        <PanelBottom size={14} strokeWidth={showResultPanel ? 2.5 : 2} />
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        className={cn(
                            showRightSidebar && 'ui-interactive-selected',
                            'border-none! bg-transparent!',
                        )}
                        title={`Toggle Right Sidebar (${resolveShortcutBinding('layout.toggleRightSidebar')})`}
                        onClick={toggleRightSidebar}
                    >
                        <PanelRight size={14} strokeWidth={showRightSidebar ? 2.5 : 2} />
                    </Button>
                    {!isMac && (
                        <WindowControls
                            onMinimize={WindowMinimise}
                            onToggleMaximize={WindowToggleMaximise}
                            onClose={Quit}
                        />
                    )}
                </div>
            </div>

            {/* Modals */}
            {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
            {licenseOpen && <LicenseModal onClose={() => setLicenseOpen(false)} />}
            <TipOfTheDayDialog open={tipOfTheDayOpen} onClose={() => setTipOfTheDayOpen(false)} />
            {updateModalOpen && updateInfo && (
                <UpdateModal
                    currentVersion={currentVersion}
                    latestVersion={updateInfo.latest_version}
                    releaseUrl={updateInfo.release_url}
                    canAutoUpdate={canAutoUpdate}
                    isApplying={isApplying}
                    onRestartAndUpdate={() => {
                        void restartAndUpdate(updateInfo);
                    }}
                    onClose={() => setUpdateModalOpen(false)}
                    onDismiss={() => {
                        dismiss();
                        setUpdateModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};
