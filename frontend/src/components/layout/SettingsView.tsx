// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState, useRef } from 'react';
import { Search, Settings as SettingsIcon, Keyboard } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useEditorStore } from '../../stores/editorStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useResolvedTheme } from '../../lib/theme';
import { utils } from '../../../wailsjs/go/models';
import { useToast } from './Toast';
import {
    applyProfilePackage,
    buildCurrentProfilePackage,
    downloadProfilePackage,
    parseProfilePackage,
} from '../../lib/profilePackage';
import { SettingsAppearance } from './settings/SettingsAppearance';
import { SettingsNotifications } from './settings/SettingsNotifications';
import { SettingsStatusBar } from './settings/SettingsStatusBar';
import { SettingsTerminal } from './settings/SettingsTerminal';
import { useStatusBarStatsStore } from '../../stores/statusBarStatsStore';
import { useTerminalSettingsStore } from '../../stores/terminalSettingsStore';
import { SettingsData } from './settings/SettingsData';
import { SettingsFormatting } from './settings/SettingsFormatting';
import { SettingsEditorColors } from './settings/SettingsEditorColors';
import { useSqlFormatPreview } from './settings/useSqlFormatPreview';
import { toSqlFormatPrefs } from '../../lib/sqlFormatSettings';
import { toSqlEditorStylePrefs } from '../../lib/sqlEditorStyle';
import { SettingsFeedback } from './settings/SettingsFeedback';
import { SettingsRegion } from './settings/SettingsRegion';
import { SettingsProfiles } from './settings/SettingsProfiles';
import { SettingsSourceControl } from './settings/SettingsSourceControl';
import { SettingsSecurity } from './settings/SettingsSecurity';
import { SettingsAssistant } from './settings/SettingsAssistant';
import { useAssistantSettings } from './settings/useAssistantSettings';
import { useMCPServerSettings } from './settings/useMCPServerSettings';
import { SettingsConnections } from './settings/SettingsConnections';
import { SettingsDebug } from './settings/SettingsDebug';
import { SettingsLicense, isLicenseConnectionFailure } from './settings/SettingsLicense';
import { LicenseModal } from './LicenseModal';
import { Button, Input } from '../ui';
import { interactiveSelected, interactiveSurface } from '../ui/contract';
import { DOM_EVENT, ENVIRONMENT_KEY } from '../../lib/constants';
import { onCommand } from '../../lib/commandBus';
import { getEnvironmentMeta } from '../../lib/projects';
import type { EnvironmentKey } from '../../types/project';
import type { SafetyLevel } from '../../types/policy';
import { resolveExecutionPolicy } from '../../lib/writeSafety/policy';
import { FEATURE } from '../../lib/license/entitlementMatrix';
import {
    getLicenseState,
    isLicenseSyncAvailable,
    refreshLicense,
    restoreLicenseByEmail,
    setSavedLicenseEmail,
} from '../../lib/license/service';
import { createLicenseState, type LicenseState } from '../../lib/license/types';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { useSecurityStore } from '../../stores/securityStore';
import { kernelErrorMessage } from '../../shared/kernel';
import { cn } from '@/lib/cn';

const OUTLINE_ITEMS = [
    { id: 'settings-appearance', label: 'Appearance' },
    { id: 'settings-notifications', label: 'Notifications' },
    { id: 'settings-status-bar', label: 'Status Bar' },
    { id: 'settings-terminal', label: 'Terminal' },
    { id: 'settings-formatting', label: 'SQL Formatting' },
    { id: 'settings-editor-colors', label: 'SQL Editor Colors' },
    { id: 'settings-data', label: 'Data & Query' },
    { id: 'settings-feedback', label: 'Feedback' },
    { id: 'settings-region', label: 'Region' },
    { id: 'settings-profiles', label: 'Profiles' },
    { id: 'settings-license', label: 'License' },
    { id: 'settings-connections', label: 'Connections' },
    { id: 'settings-source-control', label: 'Source Control' },
    { id: 'settings-assistant', label: 'Assistant' },
    { id: 'settings-security', label: 'Security' },
    { id: 'settings-debug', label: 'Debug' },
] as const;

// Dev-build-only: gates the Debug section's nav entry, search match, and
// content. Reflects whether this is a `wails dev` / `vite dev` run, not the
// packaged production build.
const isDebugBuild = import.meta.env.DEV;

interface SettingsViewProps {
    tabId: string;
}

function buildLicenseErrorState(lastError: string): LicenseState {
    return createLicenseState({
        status: 'error',
        lastError,
    });
}

function isValidEmail(value: string): boolean {
    return /\S+@\S+\.\S+/.test(value);
}

function normalizeLicenseEmail(value: string): string {
    return value.trim().toLowerCase();
}

export const SettingsView: React.FC<SettingsViewProps> = ({ tabId }) => {
    const assistantSettings = useAssistantSettings();
    const mcpSettings = useMCPServerSettings();
    const { theme, fontSize, toastPlacement, connectTimeout, queryTimeout, save } =
        useSettingsStore();
    const riskHighlight = useSettingsStore(state => state.riskHighlight);
    const minimap = useSettingsStore(state => state.minimap);
    const errorLens = useSettingsStore(state => state.errorLens);
    const sqlFormat = useSettingsStore(state => state.sqlFormat);
    const formatPreview = useSqlFormatPreview(sqlFormat);
    const sqlEditorStyle = useSettingsStore(state => state.sqlEditorStyle);
    const editorFocusMode = useSettingsStore(state => state.editorFocusMode);
    const editorFocusWidth = useSettingsStore(state => state.editorFocusWidth);
    const fontFamily = useSettingsStore(state => state.fontFamily);
    const monoFamily = useSettingsStore(state => state.monoFamily);
    const themePresetLight = useSettingsStore(state => state.themePresetLight);
    const themePresetDark = useSettingsStore(state => state.themePresetDark);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const activeProject = useProjectStore(state => state.activeProject);
    const saveProject = useProjectStore(state => state.saveProject);
    const { addTab } = useEditorStore();
    const { toast } = useToast();
    const gate = useFeatureGate();
    const canUseAppLock = gate.canUse(FEATURE.SECURITY_APP_LOCK);
    // Status-bar stats are FE-only preferences that apply the moment they are
    // flipped (no Save step), so they bind straight to their own persisted store.
    const statsEnabled = useStatusBarStatsStore(state => state.enabled);
    const setStatsEnabled = useStatusBarStatsStore(state => state.setEnabled);
    const statsShowLatency = useStatusBarStatsStore(state => state.showLatency);
    const setStatsShowLatency = useStatusBarStatsStore(state => state.setShowLatency);
    const statsShowNetwork = useStatusBarStatsStore(state => state.showNetwork);
    const setStatsShowNetwork = useStatusBarStatsStore(state => state.setShowNetwork);
    const statsShowResources = useStatusBarStatsStore(state => state.showResources);
    const setStatsShowResources = useStatusBarStatsStore(state => state.setShowResources);
    const statsIntervalMs = useStatusBarStatsStore(state => state.intervalMs);
    const setStatsIntervalMs = useStatusBarStatsStore(state => state.setIntervalMs);
    const terminalEnabled = useTerminalSettingsStore(state => state.enabled);
    const setTerminalEnabled = useTerminalSettingsStore(state => state.setEnabled);
    const appLockEnabled = useSecurityStore(state => state.app_lock_enabled);
    const appLockConfigured = useSecurityStore(state => state.app_lock_configured);
    const appLockTimeoutSec = useSecurityStore(state => state.app_lock_timeout_sec);
    const appLocked = useSecurityStore(state => state.app_locked);
    const loadSecurity = useSecurityStore(state => state.load);
    const configureAppLock = useSecurityStore(state => state.configureAppLock);
    const lockApp = useSecurityStore(state => state.lockApp);

    const [formTheme, setFormTheme] = useState(theme);
    const resolvedTheme = useResolvedTheme(formTheme);
    const [formFontSize, setFormFontSize] = useState(fontSize);
    const [formConnectTimeout, setFormConnectTimeout] = useState(connectTimeout);
    const [formQueryTimeout, setFormQueryTimeout] = useState(queryTimeout);
    const [formToastPlacement, setFormToastPlacement] = useState(toastPlacement);
    const [profileName, setProfileName] = useState('Zentro Profile');
    const [searchQuery, setSearchQuery] = useState('');
    const [autoCommitOnExit, setAutoCommitOnExit] = useState<boolean>(
        Boolean(activeProject?.auto_commit_on_exit),
    );
    const [autoCommitSaving, setAutoCommitSaving] = useState(false);
    const safetyEnvironment: EnvironmentKey = activeEnvironmentKey || ENVIRONMENT_KEY.DEVELOPMENT;
    const environmentPolicies = useSettingsStore(state => state.environmentPolicies);
    const activeSafetyPolicy =
        environmentPolicies[safetyEnvironment] ?? resolveExecutionPolicy(safetyEnvironment);
    const safetyLevel = activeSafetyPolicy.safetyLevel;
    const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
    const [licenseLoading, setLicenseLoading] = useState(true);
    const [licenseOpen, setLicenseOpen] = useState(false);
    const [retryingLicense, setRetryingLicense] = useState(false);
    const [refreshingLicense, setRefreshingLicense] = useState(false);
    const [licenseEmail, setLicenseEmail] = useState('');
    const [savingLicenseEmail, setSavingLicenseEmail] = useState(false);
    const [saveLicenseEmailError, setSaveLicenseEmailError] = useState<string | null>(null);
    const [restoringLicense, setRestoringLicense] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<(typeof OUTLINE_ITEMS)[number]['id']>(() => {
        const ownTab = useEditorStore
            .getState()
            .groups.flatMap(group => group.tabs)
            .find(tab => tab.id === tabId);
        const requestedSection = OUTLINE_ITEMS.find(item => item.id === ownTab?.content);
        return requestedSection?.id ?? 'settings-appearance';
    });

    useEffect(() => {
        return onCommand(DOM_EVENT.OPEN_SETTINGS_SECTION, detail => {
            const section = OUTLINE_ITEMS.find(item => item.id === detail?.section);
            if (section) setActiveTab(section.id);
        });
    }, []);
    const licenseSyncAvailable = isLicenseSyncAvailable();
    const canUpgrade = Boolean(gate && !gate.hasFullAccess) && licenseSyncAvailable;
    const showRestoreLicense =
        licenseSyncAvailable &&
        Boolean(
            licenseState && !(licenseState.status === 'active' && licenseState.tier !== 'free'),
        );
    const showRetryLicense = Boolean(
        licenseState?.status === 'error' && isLicenseConnectionFailure(licenseState.lastError),
    );
    const hasPendingLicenseEmailChange =
        normalizeLicenseEmail(licenseEmail) !==
        normalizeLicenseEmail(licenseState?.savedEmail ?? '');

    const loadLicenseState = React.useCallback(async (options?: { isRetry?: boolean }) => {
        const isRetry = options?.isRetry === true;
        if (isRetry) {
            setRetryingLicense(true);
        } else {
            setLicenseLoading(true);
        }

        const result = await getLicenseState();
        if (result.ok) {
            setLicenseState(result.data);
        } else {
            setLicenseState(buildLicenseErrorState(kernelErrorMessage(result.error)));
        }

        if (isRetry) {
            setRetryingLicense(false);
        } else {
            setLicenseLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === 'Escape') {
                setSearchQuery('');
                searchInputRef.current?.blur();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        void loadSecurity();
    }, [loadSecurity]);

    useEffect(() => {
        let mounted = true;
        void loadLicenseState().then(() => {
            if (!mounted) return;
        });
        return () => {
            mounted = false;
        };
    }, [loadLicenseState]);

    useEffect(() => {
        const savedEmail = licenseState?.savedEmail ?? '';
        setLicenseEmail(current =>
            normalizeLicenseEmail(current) === normalizeLicenseEmail(savedEmail)
                ? current
                : savedEmail,
        );
    }, [licenseState?.savedEmail]);

    useEffect(() => {
        setFormTheme(theme);
        setFormFontSize(fontSize);
        setFormConnectTimeout(connectTimeout);
        setFormQueryTimeout(queryTimeout);
        setFormToastPlacement(toastPlacement);
    }, [theme, fontSize, toastPlacement, connectTimeout, queryTimeout]);

    useEffect(() => {
        setAutoCommitOnExit(Boolean(activeProject?.auto_commit_on_exit));
    }, [activeProject?.id, activeProject?.auto_commit_on_exit]);

    // Auto-save effect
    useEffect(() => {
        if (
            formTheme === theme &&
            formFontSize === fontSize &&
            formConnectTimeout === connectTimeout &&
            formQueryTimeout === queryTimeout &&
            formToastPlacement === toastPlacement
        ) {
            return;
        }

        const timer = setTimeout(async () => {
            await save(
                new utils.Preferences({
                    theme: formTheme,
                    font_size: formFontSize,
                    connect_timeout: formConnectTimeout,
                    query_timeout: formQueryTimeout,
                    toast_placement: formToastPlacement,
                }),
            );
        }, 500);

        return () => clearTimeout(timer);
    }, [
        formTheme,
        formFontSize,
        formConnectTimeout,
        formQueryTimeout,
        formToastPlacement,
        save,
        theme,
        fontSize,
        toastPlacement,
        connectTimeout,
        queryTimeout,
    ]);

    const matchesSearch = (title: string, labels: string[]) => {
        const query = searchQuery.toLowerCase();
        if (!query) return true;
        return (
            title.toLowerCase().includes(query) || labels.some(l => l.toLowerCase().includes(query))
        );
    };

    const handleExportProfile = async () => {
        try {
            const profile = buildCurrentProfilePackage(profileName);
            const savedPath = await downloadProfilePackage(profile);
            if (savedPath) {
                toast.success('Profile exported.');
            }
        } catch (error) {
            console.error('Export profile failed:', error);
            toast.error(`Could not export profile: ${error}`);
        }
    };

    const handleImportProfile = async (file: File) => {
        try {
            const raw = await file.text();
            const profile = parseProfilePackage(raw);
            await applyProfilePackage(profile);
            setProfileName(profile.metadata.name || 'Zentro Profile');
        } catch (error) {
            console.error('Import profile failed:', error);
        }
    };

    const handleSafetyLevelChange = (level: SafetyLevel) => {
        if (level === safetyLevel || activeSafetyPolicy.locked) return;
        useSettingsStore
            .getState()
            .setEnvironmentSafetyLevel(safetyEnvironment, level)
            .catch(() => {
                toast.error('Failed to update the safety level.');
            });
    };

    const sourceControlEnabled = Boolean(activeProject?.id && activeProject?.storage_path);
    const appearanceMatch = matchesSearch('Appearance', [
        'Theme Interface',
        'Editor Font Size',
        'Minimap',
        'Inline Diagnostics',
        'Error Lens',
        'Focus Mode',
        'Focus Width',
        'Color Preset',
        'Solarized',
        'Interface Font',
        'Editor Font',
    ]);
    const notificationsMatch = matchesSearch('Notifications', ['Toast Position']);
    const statusBarMatch = matchesSearch('Status Bar', [
        'Live stats',
        'Latency',
        'Ping',
        'Network',
        'Traffic',
        'CPU',
        'Memory',
        'Refresh interval',
    ]);
    const terminalMatch = matchesSearch('Terminal', ['Shell', 'SSH', 'Console', 'PowerShell']);
    const formattingMatch = matchesSearch('SQL Formatting', [
        'Format Query',
        'Keyword case',
        'Indent',
        'Tabs',
        'Comma',
        'AND / OR',
    ]);
    const editorColorsMatch = matchesSearch('SQL Editor Colors', [
        'Syntax',
        'Highlight',
        'Keyword',
        'String',
        'Number',
        'Comment',
        'Bracket',
        'Color',
    ]);
    const dataMatch = matchesSearch('Data & Query', ['Write Safety', 'Safety Level']);
    const feedbackMatch = matchesSearch('Feedback & Issue', [
        'Feedback',
        'Issue',
        'Bug',
        'Feature request',
    ]);
    const regionMatch = matchesSearch('Region', ['Language']);
    const profilesMatch = matchesSearch('Profiles', [
        'Import Profile',
        'Export Profile',
        'Theme',
        'Layout',
        'Shortcuts',
    ]);
    const licenseMatch = matchesSearch('License', ['License', 'Trial', 'Pro', 'Plan', 'Status']);
    const connectionsMatch = matchesSearch('Connections', [
        'connection',
        'database',
        'server',
        'gateway',
        'host',
        'import',
        'export',
    ]);
    const sourceControlMatch = matchesSearch('Source Control', [
        'Auto commit on app exit',
        'Git repo path',
    ]);
    const assistantMatch = matchesSearch('Assistant', [
        'Codex',
        'DeepSeek',
        'API key',
        'chat',
        'OpenAI',
        'model',
    ]);
    const securityMatch = matchesSearch('Security', ['App Lock', 'PIN']);
    const debugMatch = isDebugBuild && matchesSearch('Debug', ['Feedback Prompt', 'Test']);
    const hasSettingsMatch =
        appearanceMatch ||
        notificationsMatch ||
        statusBarMatch ||
        terminalMatch ||
        formattingMatch ||
        editorColorsMatch ||
        dataMatch ||
        feedbackMatch ||
        regionMatch ||
        profilesMatch ||
        licenseMatch ||
        connectionsMatch ||
        sourceControlMatch ||
        assistantMatch ||
        securityMatch ||
        debugMatch;

    const isSearching = searchQuery.trim().length > 0;
    const sectionVisibility: Record<string, boolean> = {
        'settings-appearance': appearanceMatch,
        'settings-notifications': notificationsMatch,
        'settings-status-bar': statusBarMatch,
        'settings-terminal': terminalMatch,
        'settings-formatting': formattingMatch,
        'settings-editor-colors': editorColorsMatch,
        'settings-data': dataMatch,
        'settings-feedback': feedbackMatch,
        'settings-region': regionMatch,
        'settings-profiles': profilesMatch,
        'settings-license': licenseMatch,
        'settings-connections': connectionsMatch,
        'settings-source-control': sourceControlMatch,
        'settings-assistant': assistantMatch,
        'settings-security': securityMatch,
        'settings-debug': debugMatch,
    };
    const shouldShow = (id: string) =>
        isSearching ? (sectionVisibility[id] ?? false) : activeTab === id;

    const handleAutoCommitOnExitChange = async (checked: boolean) => {
        if (!activeProject || !activeProject.storage_path) return;
        setAutoCommitOnExit(checked);
        setAutoCommitSaving(true);
        try {
            const saved = await saveProject({
                ...activeProject,
                auto_commit_on_exit: checked,
            });
            if (!saved) {
                setAutoCommitOnExit(Boolean(activeProject.auto_commit_on_exit));
                return;
            }
        } finally {
            setAutoCommitSaving(false);
        }
    };

    const handleRetryLicense = async () => {
        await loadLicenseState({ isRetry: true });
    };

    // Forces a fresh check against the license server instead of the
    // cached in-memory state GetLicenseState() (used by Retry) returns —
    // otherwise a license activated via the email link stays invisible
    // in an already-running app until it's fully restarted, since only
    // startup sync and the ~30min background loop would normally pick it up.
    const handleRefreshLicense = async () => {
        setRefreshingLicense(true);
        const result = await refreshLicense();
        setRefreshingLicense(false);
        if (!result.ok) {
            toast.error(kernelErrorMessage(result.error));
            return;
        }
        setLicenseState(result.data);
        toast.success('License status refreshed.');
    };

    const handleSaveLicenseEmail = async () => {
        const normalizedEmail = licenseEmail.trim();
        if (normalizedEmail && !isValidEmail(normalizedEmail)) {
            toast.error('Please enter a valid email address.');
            return;
        }

        setSaveLicenseEmailError(null);
        setSavingLicenseEmail(true);
        const result = await setSavedLicenseEmail(normalizedEmail);
        setSavingLicenseEmail(false);
        if (!result.ok) {
            setSaveLicenseEmailError(kernelErrorMessage(result.error));
            return;
        }

        setLicenseState(result.data);
        if (result.data.restoreAvailable) {
            return;
        }
        toast.success(
            normalizedEmail
                ? 'License email saved for this installation.'
                : 'Saved license email cleared for this installation.',
        );
    };

    const handleRestoreLicense = async () => {
        const normalizedEmail = licenseEmail.trim();
        if (!normalizedEmail) {
            toast.error('Email is required to restore license.');
            return;
        }
        if (!isValidEmail(normalizedEmail)) {
            toast.error('Please enter a valid email address.');
            return;
        }

        setSaveLicenseEmailError(null);
        setRestoringLicense(true);
        const result = await restoreLicenseByEmail(normalizedEmail);
        setRestoringLicense(false);
        if (!result.ok) {
            setSaveLicenseEmailError(kernelErrorMessage(result.error));
            return;
        }

        setLicenseState(result.data);
        if (result.data.status === 'activating') {
            toast.success(
                'Restore link sent — check your email to finish restoring on this device.',
            );
            return;
        }
        toast.success('License restored for this device.');
    };

    return (
        <div className='flex h-full flex-col overflow-hidden bg-card'>
            <div className='z-sticky flex h-16 items-center justify-between bg-card px-6'>
                <div className='flex items-center gap-3 text-foreground'>
                    <div className='rounded-md bg-accent/5 p-2 text-accent'>
                        <SettingsIcon size={18} />
                    </div>
                    <h1 className='ui-text-section tracking-tight'>System Settings</h1>
                </div>

                <div className='flex max-w-2xl flex-1 justify-center px-8'>
                    <div className='relative w-full max-w-md'>
                        <Search
                            size={14}
                            className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground'
                        />
                        <Input
                            placeholder='Search settings...'
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            size='sm'
                            variant='ghost'
                            className='pl-8'
                            aria-label='Search settings'
                        />
                    </div>
                </div>

                <div className='flex items-center gap-2'>
                    <Button
                        onClick={() => addTab({ type: 'shortcuts', name: 'Keyboard Shortcuts' })}
                        variant='ghost'
                        size='sm'
                        className='gap-2 text-label uppercase tracking-widest'
                        title='Keyboard Shortcuts'
                        aria-label='Open keyboard shortcuts'
                    >
                        <Keyboard size={16} />
                    </Button>
                </div>
            </div>

            <div className='flex flex-1 overflow-hidden py-1 px-0'>
                {/* Left sidebar nav */}
                <aside className='w-48 shrink-0 overflow-y-auto rounded-md border border-(--border-panel) p-1'>
                    <nav className='flex flex-col gap-1'>
                        {OUTLINE_ITEMS.filter(
                            ({ id }) => id !== 'settings-debug' || isDebugBuild,
                        ).map(({ id, label }) => {
                            const isActive = !isSearching && activeTab === id;
                            const hasMatch = isSearching && (sectionVisibility[id] ?? false);
                            const isDimmed = isSearching && !(sectionVisibility[id] ?? false);
                            return (
                                <Button
                                    key={id}
                                    variant='ghost'
                                    onClick={() => {
                                        setSearchQuery('');
                                        setActiveTab(id);
                                    }}
                                    className={cn(
                                        'flex h-auto w-full items-center gap-2 rounded-md px-5 py-1.5 text-left text-small transition-colors',
                                        isActive
                                            ? `font-medium ${interactiveSelected}`
                                            : isDimmed
                                              ? 'text-muted-foreground/35'
                                              : interactiveSurface,
                                    )}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <span className='flex-1'>{label}</span>
                                    {hasMatch && (
                                        <span
                                            className='h-1.5 w-1.5 rounded-full bg-accent'
                                            aria-hidden
                                        />
                                    )}
                                </Button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Main content */}
                <main className='flex-1 overflow-y-auto scroll-smooth'>
                    <div className='mx-auto flex w-full max-w-3xl flex-col gap-4 px-8 py-6 animate-in fade-in duration-300'>
                        {shouldShow('settings-appearance') && (
                            <SettingsAppearance
                                theme={formTheme}
                                onThemeChange={val => {
                                    // Commit the theme immediately — a light/dark
                                    // switch must land on the first click, not
                                    // after the 500ms form-input debounce.
                                    setFormTheme(val);
                                    void useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ theme: val }));
                                }}
                                resolvedTheme={resolvedTheme}
                                fontSize={formFontSize}
                                onFontSizeChange={setFormFontSize}
                                minimap={minimap}
                                onMinimapChange={checked => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ minimap: checked }));
                                }}
                                errorLens={errorLens}
                                onErrorLensChange={checked => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ error_lens: checked }));
                                }}
                                editorFocusMode={editorFocusMode}
                                onEditorFocusModeChange={checked => {
                                    useSettingsStore
                                        .getState()
                                        .save(
                                            new utils.Preferences({ editor_focus_mode: checked }),
                                        );
                                }}
                                editorFocusWidth={editorFocusWidth}
                                onEditorFocusWidthChange={val => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ editor_focus_width: val }));
                                }}
                                fontFamily={fontFamily}
                                onFontFamilyChange={value => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ font_family: value }));
                                }}
                                monoFamily={monoFamily}
                                onMonoFamilyChange={value => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ mono_family: value }));
                                }}
                                themePresetLight={themePresetLight}
                                themePresetDark={themePresetDark}
                                onThemePresetChange={(appearance, presetId) => {
                                    // One atomic save: the preset AND the
                                    // light/dark family it belongs to, so the
                                    // DOM re-themes on the first pick instead of
                                    // waiting for the debounced theme write.
                                    setFormTheme(appearance);
                                    void useSettingsStore.getState().save(
                                        new utils.Preferences(
                                            appearance === 'light'
                                                ? {
                                                      theme: appearance,
                                                      theme_preset_light: presetId,
                                                  }
                                                : {
                                                      theme: appearance,
                                                      theme_preset_dark: presetId,
                                                  },
                                        ),
                                    );
                                }}
                            />
                        )}

                        {shouldShow('settings-notifications') && (
                            <SettingsNotifications
                                toastPlacement={formToastPlacement}
                                onToastPlacementChange={setFormToastPlacement}
                                onTestNotification={variant => {
                                    if (variant === 'success') {
                                        toast.success('This is a success notification preview.');
                                        return;
                                    }
                                    if (variant === 'error') {
                                        toast.error('This is an error notification preview.');
                                        return;
                                    }
                                    toast.info('This is an info notification preview.');
                                }}
                            />
                        )}

                        {shouldShow('settings-status-bar') && (
                            <SettingsStatusBar
                                enabled={statsEnabled}
                                onEnabledChange={setStatsEnabled}
                                showLatency={statsShowLatency}
                                onShowLatencyChange={setStatsShowLatency}
                                showNetwork={statsShowNetwork}
                                onShowNetworkChange={setStatsShowNetwork}
                                showResources={statsShowResources}
                                onShowResourcesChange={setStatsShowResources}
                                intervalMs={statsIntervalMs}
                                onIntervalMsChange={setStatsIntervalMs}
                            />
                        )}

                        {shouldShow('settings-terminal') && (
                            <SettingsTerminal
                                enabled={terminalEnabled}
                                onEnabledChange={setTerminalEnabled}
                            />
                        )}

                        {shouldShow('settings-formatting') && (
                            <SettingsFormatting
                                value={sqlFormat}
                                onChange={patch => {
                                    void useSettingsStore.getState().save(
                                        new utils.Preferences({
                                            sql_format: toSqlFormatPrefs({
                                                ...sqlFormat,
                                                ...patch,
                                            }),
                                        }),
                                    );
                                }}
                                preview={formatPreview}
                            />
                        )}

                        {shouldShow('settings-editor-colors') && (
                            <SettingsEditorColors
                                value={sqlEditorStyle}
                                currentAppearance={resolvedTheme}
                                presetIds={{ light: themePresetLight, dark: themePresetDark }}
                                onChange={next => {
                                    void useSettingsStore.getState().save(
                                        new utils.Preferences({
                                            sql_editor_style: toSqlEditorStylePrefs(next),
                                        }),
                                    );
                                }}
                            />
                        )}

                        {shouldShow('settings-data') && (
                            <SettingsData
                                connectTimeout={formConnectTimeout}
                                onConnectTimeoutChange={setFormConnectTimeout}
                                queryTimeout={formQueryTimeout}
                                onQueryTimeoutChange={setFormQueryTimeout}
                                activeSafetyEnvironment={safetyEnvironment}
                                safetyLevel={safetyLevel}
                                safetyLevelLocked={activeSafetyPolicy.locked}
                                onSafetyLevelChange={handleSafetyLevelChange}
                                riskHighlight={riskHighlight}
                                onRiskHighlightChange={checked => {
                                    useSettingsStore
                                        .getState()
                                        .save(new utils.Preferences({ risk_highlight: checked }));
                                }}
                            />
                        )}

                        {shouldShow('settings-feedback') && (
                            <SettingsFeedback
                                environmentLabel={getEnvironmentMeta(safetyEnvironment).label}
                            />
                        )}

                        {shouldShow('settings-region') && <SettingsRegion />}

                        {shouldShow('settings-profiles') && (
                            <SettingsProfiles
                                profileName={profileName}
                                onProfileNameChange={setProfileName}
                                onExportProfile={handleExportProfile}
                                onImportProfile={handleImportProfile}
                            />
                        )}

                        {shouldShow('settings-license') && (
                            <SettingsLicense
                                licenseState={licenseState}
                                loading={licenseLoading}
                                onOpenLicense={() => setLicenseOpen(true)}
                                upgradeUrl={gate.upgradeUrl}
                                canUpgrade={canUpgrade}
                                onRetry={() => {
                                    void handleRetryLicense();
                                }}
                                retrying={retryingLicense}
                                canRetry={showRetryLicense}
                                onRefresh={
                                    licenseSyncAvailable
                                        ? () => {
                                              void handleRefreshLicense();
                                          }
                                        : undefined
                                }
                                refreshing={refreshingLicense}
                                licenseEmail={licenseEmail}
                                onLicenseEmailChange={value => {
                                    setSaveLicenseEmailError(null);
                                    setLicenseEmail(value);
                                }}
                                onSaveEmail={() => {
                                    void handleSaveLicenseEmail();
                                }}
                                savingEmail={savingLicenseEmail}
                                canSaveEmail={hasPendingLicenseEmailChange}
                                onRestore={() => {
                                    void handleRestoreLicense();
                                }}
                                restoring={restoringLicense}
                                showRestore={showRestoreLicense}
                                saveEmailError={saveLicenseEmailError}
                                licenseSyncAvailable={licenseSyncAvailable}
                            />
                        )}

                        {shouldShow('settings-connections') && <SettingsConnections />}

                        {shouldShow('settings-source-control') && (
                            <SettingsSourceControl
                                enabled={sourceControlEnabled}
                                checked={autoCommitOnExit}
                                saving={autoCommitSaving}
                                repoPath={activeProject?.storage_path}
                                onToggle={checked => {
                                    void handleAutoCommitOnExitChange(checked);
                                }}
                            />
                        )}

                        {shouldShow('settings-assistant') && (
                            <SettingsAssistant model={assistantSettings} mcp={mcpSettings} />
                        )}

                        {shouldShow('settings-security') && (
                            <SettingsSecurity
                                canUseAppLock={canUseAppLock}
                                appLockEnabled={appLockEnabled}
                                appLockConfigured={appLockConfigured}
                                appLockTimeoutSec={appLockTimeoutSec}
                                appLocked={appLocked}
                                onConfigureAppLock={configureAppLock}
                                onLockNow={lockApp}
                            />
                        )}

                        {isDebugBuild && shouldShow('settings-debug') && <SettingsDebug />}

                        {isSearching && !hasSettingsMatch && (
                            <div className='rounded-md bg-card/35 p-4 text-center'>
                                <h3 className='ui-text-section text-foreground'>
                                    No settings matched
                                </h3>
                                <p className='ui-text-small text-muted-foreground'>
                                    Try another keyword to find the setting you need.
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            {licenseOpen && <LicenseModal onClose={() => setLicenseOpen(false)} />}
        </div>
    );
};
