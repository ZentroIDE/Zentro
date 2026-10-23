// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../platform/apiGatewayRuntime';
import { kernelErrorMessage, unwrapOrThrow } from '../shared/kernel';
import { WindowReloadApp } from '../../wailsjs/runtime/runtime';
import { useConnectionStore } from '../stores/connectionStore';
import { useEditorStore } from '../stores/editorStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useStatusStore } from '../stores/statusStore';
import { useEnvironmentStore } from '../stores/environmentStore';
import { useProjectStore } from '../stores/projectStore';
import { useZoomStore } from '../stores/zoomStore';
import { useSecurityStore } from '../stores/securityStore';
import { useTerminalSettingsStore } from '../stores/terminalSettingsStore';
import {
    DOM_EVENT,
    ENVIRONMENT_KEY,
    TRANSACTION_STATUS,
    type EnvironmentKey,
    TAB_TYPE,
} from './constants';
import { emitCommand } from './commandBus';
import { ProjectHubSurface, ProjectWizardMode } from './enums';
import { utils } from '../../wailsjs/go/models';
import { getEnvironmentLabel } from './projects';
import { toast as sonnerToast } from 'sonner';
import { openFocusedContextMenu } from './openContextMenu';
import { useAIChatStore } from '../stores/aiChatStore';
import { questionItems, stepQuestion } from './aiQuestionNav';

export type CommandCategory = 'Editor' | 'Layout' | 'Connection' | 'View' | 'App';

export type BuiltInCommandId =
    | 'editor.newTab'
    | 'editor.saveTab'
    | 'editor.closeTab'
    | 'editor.contextSearch'
    | 'editor.searchScripts'
    | 'editor.runQuery'
    | 'query.cancel'
    | 'editor.explain'
    | 'editor.explainAnalyze'
    | 'editor.expandWildcardAndRun'
    | 'editor.formatQuery'
    | 'editor.toggleBookmark'
    | 'editor.nextBookmark'
    | 'editor.focusEditor'
    | 'editor.focusResultGrid'
    | 'editor.focusErd'
    | 'editor.schemaDiff'
    | 'view.openSettings'
    | 'view.openShortcuts'
    | 'assistant.previousQuestion'
    | 'assistant.nextQuestion'
    | 'view.commandPalette'
    | 'view.openContextMenu'
    | 'view.toggleViewMode'
    | 'view.zoomIn'
    | 'view.zoomOut'
    | 'view.zoomReset'
    | 'layout.toggleSidebar'
    | 'layout.toggleRightSidebar'
    | 'layout.toggleResultPanel'
    | 'layout.toggleAuditLog'
    | 'layout.toggleActivityPanel'
    | 'layout.toggleTerminal'
    | 'layout.toggleFocusMode'
    | 'layout.focusExplorer'
    | 'editor.focusToolbar'
    | 'editor.focusTabStrip'
    | 'editor.nextTab'
    | 'editor.prevTab'
    | 'editor.goToTab1'
    | 'editor.goToTab2'
    | 'editor.goToTab3'
    | 'editor.goToTab4'
    | 'editor.goToTab5'
    | 'editor.goToTab6'
    | 'editor.goToTab7'
    | 'editor.goToTab8'
    | 'editor.goToTab9'
    | 'connection.openEnvironmentSwitcher'
    | 'connection.openProjectSwitcher'
    | 'connection.openProjectHub'
    | 'connection.newProject'
    | 'connection.openProjectFolder'
    | 'connection.switchEnvDevelopment'
    | 'connection.switchEnvStaging'
    | 'connection.switchEnvProduction'
    | 'connection.beginTx'
    | 'connection.commitTx'
    | 'connection.rollbackTx'
    | 'security.lockApp'
    | 'app.reload';

export const SECURITY_COMMAND = {
    LOCK_APP: 'security.lockApp' as const satisfies BuiltInCommandId,
} as const;

export type CommandId = BuiltInCommandId | `ext.${string}`;

export interface CommandRegistryEntry {
    id: CommandId;
    label: string;
    category: CommandCategory;

    defaultBinding: string;
    defaultWhen?: string;
    action: () => void | Promise<void>;
    isEnabled?: () => boolean;
}

export type ShortcutRegistryEntry = CommandRegistryEntry;

const MODIFIER_ORDER: Record<string, number> = {
    ctrl: 0,
    shift: 1,
    alt: 2,
    meta: 3,
};

// stepAssistantQuestion scrolls the assistant chat one question up or down.
function stepAssistantQuestion(direction: -1 | 1) {
    const state = useAIChatStore.getState();
    stepQuestion(questionItems(state.session?.turns, state.pending), direction);
}

async function switchProjectEnvironmentShortcut(environmentKey: EnvironmentKey) {
    const projectStore = useProjectStore.getState();
    const environmentStore = useEnvironmentStore.getState();
    const activeProject = projectStore.activeProject;
    if (!activeProject) return;

    if (environmentStore.activeEnvironmentKey === environmentKey) return;

    const hasBoundConnection = (activeProject.environments || []).some(
        environment => environment.key === environmentKey && Boolean(environment.connection_ref),
    );
    if (!hasBoundConnection) {
        sonnerToast.error(
            `Cannot switch to ${getEnvironmentLabel(environmentKey)}: no bound connection.`,
        );
        return;
    }

    const connected = await getApiGateway().project.connectProjectEnvironment(environmentKey);
    if (!connected.ok) {
        sonnerToast.error(`Could not switch environment: ${kernelErrorMessage(connected.error)}`);
        return;
    }

    const updated = await projectStore.setProjectEnvironment(environmentKey);
    if (!updated) {
        sonnerToast.error('Could not switch environment.');
        return;
    }

    environmentStore.setActiveEnvironment(environmentKey);

    if (environmentKey === ENVIRONMENT_KEY.PRODUCTION) {
        const settings = useSettingsStore.getState();
        if (!settings.viewMode) {
            await settings.save(new utils.Preferences({ view_mode: true }));
        }
    }
}

// Exported so grid-level shortcuts (useResultKeyboard.ts's Ctrl+PageUp/Down)
// can reuse the same next/prev-tab behavior as editor.nextTab/editor.prevTab
// instead of re-implementing tab cycling.
export function switchTabRelative(direction: 1 | -1) {
    const state = useEditorStore.getState();
    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group || group.tabs.length < 2) return;
    const currentIndex = group.tabs.findIndex(tab => tab.id === group.activeTabId);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + direction + group.tabs.length) % group.tabs.length;
    const nextTab = group.tabs[nextIndex];
    if (nextTab) state.setActiveTabId(nextTab.id, group.id);
}

function goToTabIndex(index: number) {
    const state = useEditorStore.getState();
    const group = state.groups.find(g => g.id === state.activeGroupId);
    const tab = group?.tabs[index];
    if (group && tab) state.setActiveTabId(tab.id, group.id);
}

async function toggleViewModeShortcut() {
    const settings = useSettingsStore.getState();
    const next = !settings.viewMode;
    const transactionStatus = useStatusStore.getState().transactionStatus;

    if (next && transactionStatus === TRANSACTION_STATUS.ACTIVE) {
        return;
    }

    await settings.save(new utils.Preferences({ view_mode: next }));
}

function getBaseCommandRegistry(): CommandRegistryEntry[] {
    return [
        {
            id: 'editor.newTab',
            label: 'New Query Tab',
            category: 'Editor',
            defaultBinding: 'Ctrl+T',
            action: () => {
                useEditorStore.getState().addTab();
            },
        },
        {
            id: 'editor.saveTab',
            label: 'Save Current Tab',
            category: 'Editor',
            defaultBinding: 'Ctrl+S',
            defaultWhen: 'queryTabActive && !viewMode && !captureFocus',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                if (activeGroup?.activeTabId) {
                    emitCommand(DOM_EVENT.SAVE_TAB_ACTION, activeGroup.activeTabId);
                }
            },
        },
        {
            id: 'editor.closeTab',
            label: 'Close Current Tab',
            category: 'Editor',
            defaultBinding: 'Ctrl+W',
            action: () => {
                emitCommand(DOM_EVENT.CLOSE_ACTIVE_TAB);
            },
        },
        {
            id: 'editor.contextSearch',
            label: 'Open Context Search',
            category: 'Editor',
            defaultBinding: 'Ctrl+E',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH);
            },
        },
        {
            id: 'editor.searchScripts',
            label: 'Search Scripts',
            category: 'Editor',
            defaultBinding: 'F1',
            // Deliberately no defaultWhen and not Monaco-blocklisted: this
            // must win over Monaco's own F1 (Command Palette) even while the
            // SQL editor is focused, so it stays registered as a Monaco
            // action too (see registerAppCommandsInMonaco) instead of only
            // firing from the window-level listener.
            action: () => {
                emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, { initialQuery: '# ' });
            },
        },
        {
            id: 'editor.runQuery',
            label: 'Run Query',
            category: 'Editor',
            defaultBinding: 'Ctrl+Enter',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.RUN_QUERY_ACTION, { tabId: activeTab.id });
                }
            },
        },
        {
            id: 'query.cancel',
            label: 'Cancel Running Query',
            category: 'Editor',
            defaultBinding: 'Ctrl+F2',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (!activeTab?.isRunning) return;
                void getApiGateway()
                    .query.cancel(activeTab.id)
                    .then(result => {
                        if (!result.ok) {
                            sonnerToast.error(`Cancel failed: ${kernelErrorMessage(result.error)}`);
                        }
                    });
            },
        },
        {
            id: 'editor.explain',
            label: 'Explain Query',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+E',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.RUN_EXPLAIN_ACTION, {
                        tabId: activeTab.id,
                        analyze: false,
                    });
                }
            },
        },
        {
            id: 'editor.explainAnalyze',
            label: 'Explain Analyze',
            category: 'Editor',
            defaultBinding: 'Ctrl+Alt+E',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.RUN_EXPLAIN_ACTION, {
                        tabId: activeTab.id,
                        analyze: true,
                    });
                }
            },
        },
        {
            id: 'editor.focusEditor',
            label: 'Focus Editor',
            category: 'Editor',
            defaultBinding: 'Ctrl+I',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ACTIVE_EDITOR);
            },
        },
        {
            id: 'editor.focusResultGrid',
            label: 'Focus Result Grid',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+G',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'resultGrid' });
            },
        },
        {
            id: 'editor.focusErd',
            label: 'Focus ERD Diagram',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+M',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'erd' });
            },
        },
        {
            id: 'editor.expandWildcardAndRun',
            label: 'Expand * and Run',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+Enter',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.EXPAND_WILDCARD_AND_RUN_ACTION, { tabId: activeTab.id });
                }
            },
        },
        {
            id: 'editor.formatQuery',
            label: 'Format Query',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+F',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.FORMAT_QUERY_ACTION, { tabId: activeTab.id });
                }
            },
        },
        {
            id: 'editor.toggleBookmark',
            label: 'Toggle Bookmark',
            category: 'Editor',
            defaultBinding: 'Ctrl+F3',
            defaultWhen: 'sqlEditorFocus && queryTabActive',
            action: () => {
                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                if (activeTab) {
                    emitCommand(DOM_EVENT.TOGGLE_BOOKMARK_ACTION, {
                        tabId: activeTab.id,
                    });
                }
            },
        },
        {
            id: 'editor.nextBookmark',
            label: 'Next Bookmark',
            category: 'Editor',
            defaultBinding: 'F3',
            defaultWhen: 'queryTabActive',
            action: () => {
                if (document.querySelector('.monaco-editor.focused')) {
                    const state = useEditorStore.getState();
                    const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                    const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
                    if (activeTab) {
                        emitCommand(DOM_EVENT.NEXT_BOOKMARK_ACTION, {
                            tabId: activeTab.id,
                        });
                    }
                    return;
                }

                const state = useEditorStore.getState();
                const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
                if (activeGroup?.activeTabId) {
                    emitCommand(DOM_EVENT.RENAME_TAB, activeGroup.activeTabId);
                }
            },
        },
        {
            id: 'editor.schemaDiff',
            label: 'Open Schema Diff',
            category: 'Editor',
            defaultBinding: 'Ctrl+Shift+D',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_SCHEMA_DIFF);
            },
        },
        {
            id: 'view.openSettings',
            label: 'Open Settings',
            category: 'View',
            defaultBinding: 'Ctrl+,',
            action: () => {
                useEditorStore.getState().addTab({ type: TAB_TYPE.SETTINGS, name: 'Settings' });
            },
        },
        {
            id: 'assistant.previousQuestion',
            label: 'Assistant: Previous Question',
            category: 'View',
            defaultBinding: 'Alt+ArrowUp',
            // Only while focus is inside the assistant: Alt+Up also moves a line
            // in the SQL editor.
            defaultWhen: 'assistantFocus',
            action: () => stepAssistantQuestion(-1),
        },
        {
            id: 'assistant.nextQuestion',
            label: 'Assistant: Next Question',
            category: 'View',
            defaultBinding: 'Alt+ArrowDown',
            defaultWhen: 'assistantFocus',
            action: () => stepAssistantQuestion(1),
        },
        {
            id: 'view.openShortcuts',
            label: 'Open Keyboard Shortcuts',
            category: 'View',
            defaultBinding: 'Ctrl+K Ctrl+B',
            action: () => {
                useEditorStore
                    .getState()
                    .addTab({ type: TAB_TYPE.SHORTCUTS, name: 'Keyboard Shortcuts' });
            },
        },
        {
            id: 'view.commandPalette',
            label: 'Open Command Palette',
            category: 'View',
            defaultBinding: 'Ctrl+Shift+P',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_COMMAND_PALETTE);
            },
        },
        {
            id: 'view.openContextMenu',
            label: 'Open Context Menu',
            category: 'View',
            defaultBinding: 'F4',
            action: () => {
                openFocusedContextMenu();
            },
        },
        {
            id: 'view.toggleViewMode',
            label: 'Toggle View Mode',
            category: 'View',
            defaultBinding: 'Alt+Shift+V',
            action: async () => {
                await toggleViewModeShortcut();
            },
        },
        {
            id: 'view.zoomIn',
            label: 'Zoom In',
            category: 'View',
            defaultBinding: 'Ctrl+=',
            action: () => {
                useZoomStore.getState().zoomIn();
            },
        },
        {
            id: 'view.zoomOut',
            label: 'Zoom Out',
            category: 'View',
            defaultBinding: 'Ctrl+-',
            action: () => {
                useZoomStore.getState().zoomOut();
            },
        },
        {
            id: 'view.zoomReset',
            label: 'Reset Zoom',
            category: 'View',
            defaultBinding: 'Ctrl+0',
            action: () => {
                useZoomStore.getState().resetZoom();
            },
        },
        {
            id: 'layout.toggleSidebar',
            label: 'Toggle Left Sidebar',
            category: 'Layout',
            defaultBinding: 'Ctrl+B',
            action: () => {
                useLayoutStore.getState().toggleSidebar();
            },
        },
        {
            id: 'layout.toggleRightSidebar',
            label: 'Toggle Right Sidebar',
            category: 'Layout',
            defaultBinding: 'Ctrl+Alt+B',
            action: () => {
                useLayoutStore.getState().toggleRightSidebar();
            },
        },
        {
            id: 'layout.toggleResultPanel',
            label: 'Toggle Result Panel',
            category: 'Layout',
            defaultBinding: 'Ctrl+J',
            action: () => {
                useLayoutStore.getState().toggleResultPanel();
            },
        },
        {
            id: 'layout.toggleAuditLog',
            label: 'Toggle Audit Log',
            category: 'Layout',
            defaultBinding: 'Ctrl+Shift+L',
            action: () => {
                const layout = useLayoutStore.getState();
                if (!layout.showResultPanel) {
                    layout.setShowResultPanel(true);
                }
                if (layout.bottomPanelView === 'panel' && layout.activeBottomPanelId === 'audit') {
                    layout.setBottomPanelView('result');
                } else {
                    layout.setBottomPanelView('panel');
                    layout.setActiveBottomPanelId('audit');
                }
            },
        },
        {
            id: 'layout.toggleActivityPanel',
            label: 'Toggle Activity Panel',
            category: 'Layout',
            defaultBinding: 'Ctrl+Shift+Y',
            action: () => {
                const layout = useLayoutStore.getState();
                if (!layout.showResultPanel) {
                    layout.setShowResultPanel(true);
                }
                if (
                    layout.bottomPanelView === 'panel' &&
                    layout.activeBottomPanelId === 'activity'
                ) {
                    layout.setBottomPanelView('result');
                } else {
                    layout.setBottomPanelView('panel');
                    layout.setActiveBottomPanelId('activity');
                }
            },
        },
        {
            // Only exists while the terminal is switched on in Settings (the
            // panel itself is registered on that condition, see
            // app/useTerminalPanelRegistration.tsx).
            id: 'layout.toggleTerminal',
            label: 'Toggle Terminal',
            category: 'Layout',
            defaultBinding: 'Ctrl+`',
            isEnabled: () => useTerminalSettingsStore.getState().enabled,
            action: () => {
                const layout = useLayoutStore.getState();
                if (!layout.showResultPanel) {
                    layout.setShowResultPanel(true);
                }
                if (
                    layout.bottomPanelView === 'panel' &&
                    layout.activeBottomPanelId === 'terminal'
                ) {
                    layout.setBottomPanelView('result');
                } else {
                    layout.setBottomPanelView('panel');
                    layout.setActiveBottomPanelId('terminal');
                }
            },
        },
        {
            id: 'layout.toggleFocusMode',
            label: 'Toggle Focus Mode',
            category: 'Layout',
            defaultBinding: 'Ctrl+Alt+Z',
            action: () => {
                useSettingsStore.getState().toggleEditorFocusMode();
            },
        },
        {
            // editor.explain owns this chord inside the SQL editor. Outside
            // it, the same keys focus the explorer.
            id: 'layout.focusExplorer',
            label: 'Focus Database Explorer',
            category: 'Layout',
            defaultBinding: 'Ctrl+Shift+E',
            defaultWhen: '!sqlEditorFocus',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'explorer' });
            },
        },
        {
            // Not "Ctrl+E Ctrl+T": the chord engine matches the *first*
            // registered rule whose first token equals the pressed key, and
            // "Ctrl+E" alone is already editor.contextSearch's single-key
            // binding — it would win every time and the chord would never
            // get a chance to start. "Ctrl+K" is already a chord-only
            // prefix (view.openShortcuts uses "Ctrl+K Ctrl+B"), so reusing
            // it here is safe.
            id: 'editor.focusToolbar',
            label: 'Focus Editor Toolbar',
            category: 'Editor',
            defaultBinding: 'Ctrl+K Ctrl+T',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'editorToolbar' });
            },
        },
        {
            // "Ctrl+Shift+T" (VS Code's Tab Strip-adjacent "reopen closed
            // tab") is reserved by most browsers/OSes — picked a free
            // combo instead.
            id: 'editor.focusTabStrip',
            label: 'Focus Tab Strip',
            category: 'Editor',
            defaultBinding: 'Alt+Shift+T',
            action: () => {
                emitCommand(DOM_EVENT.FOCUS_ZONE, { zoneId: 'tabStrip' });
            },
        },
        {
            id: 'editor.nextTab',
            label: 'Next Tab',
            category: 'Editor',
            // Not Ctrl+Tab: that is the most-recently-used tab switcher
            // (useTabCycling). A global rule on it is consumed first, in the
            // capture phase, and turns the switcher into plain left-to-right
            // cycling.
            defaultBinding: 'Ctrl+PageDown',
            action: () => switchTabRelative(1),
        },
        {
            id: 'editor.prevTab',
            label: 'Previous Tab',
            category: 'Editor',
            defaultBinding: 'Ctrl+PageUp',
            action: () => switchTabRelative(-1),
        },
        {
            id: 'editor.goToTab1',
            label: 'Go to Tab 1',
            category: 'Editor',
            defaultBinding: 'Ctrl+1',
            action: () => goToTabIndex(0),
        },
        {
            id: 'editor.goToTab2',
            label: 'Go to Tab 2',
            category: 'Editor',
            defaultBinding: 'Ctrl+2',
            action: () => goToTabIndex(1),
        },
        {
            id: 'editor.goToTab3',
            label: 'Go to Tab 3',
            category: 'Editor',
            defaultBinding: 'Ctrl+3',
            action: () => goToTabIndex(2),
        },
        {
            id: 'editor.goToTab4',
            label: 'Go to Tab 4',
            category: 'Editor',
            defaultBinding: 'Ctrl+4',
            action: () => goToTabIndex(3),
        },
        {
            id: 'editor.goToTab5',
            label: 'Go to Tab 5',
            category: 'Editor',
            defaultBinding: 'Ctrl+5',
            action: () => goToTabIndex(4),
        },
        {
            id: 'editor.goToTab6',
            label: 'Go to Tab 6',
            category: 'Editor',
            defaultBinding: 'Ctrl+6',
            action: () => goToTabIndex(5),
        },
        {
            id: 'editor.goToTab7',
            label: 'Go to Tab 7',
            category: 'Editor',
            defaultBinding: 'Ctrl+7',
            action: () => goToTabIndex(6),
        },
        {
            id: 'editor.goToTab8',
            label: 'Go to Tab 8',
            category: 'Editor',
            defaultBinding: 'Ctrl+8',
            action: () => goToTabIndex(7),
        },
        {
            id: 'editor.goToTab9',
            label: 'Go to Tab 9',
            category: 'Editor',
            defaultBinding: 'Ctrl+9',
            action: () => goToTabIndex(8),
        },
        {
            id: 'connection.openEnvironmentSwitcher',
            label: 'Quick Switch Environment',
            category: 'Connection',
            defaultBinding: 'Alt+Shift+E',
            action: () => {
                emitCommand(DOM_EVENT.QUICK_SWITCH_ENVIRONMENT);
            },
        },
        {
            id: 'connection.openProjectSwitcher',
            label: 'Quick Switch Project',
            category: 'Connection',
            defaultBinding: 'Ctrl+P',
            action: () => {
                emitCommand(DOM_EVENT.QUICK_SWITCH_PROJECT);
            },
        },
        {
            id: 'connection.openProjectHub',
            label: 'Open Project Hub',
            category: 'Connection',
            defaultBinding: 'Ctrl+Alt+P',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_PROJECT_HUB);
            },
        },
        {
            id: 'connection.newProject',
            label: 'New Project',
            category: 'Connection',
            defaultBinding: 'Ctrl+Alt+N',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                    surface: ProjectHubSurface.WIZARD,
                    wizardMode: ProjectWizardMode.CREATE,
                });
            },
        },
        {
            id: 'connection.openProjectFolder',
            label: 'Open Project Folder…',
            category: 'Connection',
            defaultBinding: 'Ctrl+Alt+O',
            action: () => {
                emitCommand(DOM_EVENT.OPEN_PROJECT_FOLDER);
            },
        },
        {
            id: 'connection.switchEnvDevelopment',
            label: 'Switch Environment: Development',
            category: 'Connection',
            defaultBinding: 'Alt+Shift+D',
            action: async () => {
                await switchProjectEnvironmentShortcut(ENVIRONMENT_KEY.DEVELOPMENT);
            },
        },
        {
            id: 'connection.switchEnvStaging',
            label: 'Switch Environment: Staging',
            category: 'Connection',
            defaultBinding: 'Alt+Shift+G',
            action: async () => {
                await switchProjectEnvironmentShortcut(ENVIRONMENT_KEY.STAGING);
            },
        },
        {
            id: 'connection.switchEnvProduction',
            label: 'Switch Environment: Production',
            category: 'Connection',
            defaultBinding: 'Alt+Shift+P',
            action: async () => {
                await switchProjectEnvironmentShortcut(ENVIRONMENT_KEY.PRODUCTION);
            },
        },
        {
            id: 'connection.beginTx',
            label: 'Begin Transaction',
            category: 'Connection',
            defaultBinding: 'Ctrl+Shift+7',
            defaultWhen: 'connectionActive && !viewMode',
            action: async () => {
                if (
                    useConnectionStore.getState().isConnected &&
                    !useSettingsStore.getState().viewMode
                ) {
                    unwrapOrThrow(await getApiGateway().connection.beginTransaction());
                }
            },
        },
        {
            id: 'connection.commitTx',
            label: 'Commit Transaction',
            category: 'Connection',
            defaultBinding: 'Ctrl+Shift+8',
            defaultWhen: 'connectionActive && !viewMode',
            action: async () => {
                if (
                    useConnectionStore.getState().isConnected &&
                    !useSettingsStore.getState().viewMode
                ) {
                    unwrapOrThrow(await getApiGateway().connection.commitTransaction());
                }
            },
        },
        {
            id: 'connection.rollbackTx',
            label: 'Rollback Transaction',
            category: 'Connection',
            defaultBinding: 'Ctrl+Shift+9',
            defaultWhen: 'connectionActive && !viewMode',
            action: async () => {
                if (
                    useConnectionStore.getState().isConnected &&
                    !useSettingsStore.getState().viewMode
                ) {
                    unwrapOrThrow(await getApiGateway().connection.rollbackTransaction());
                }
            },
        },
        {
            id: SECURITY_COMMAND.LOCK_APP,
            label: 'Lock App',
            category: 'App',
            defaultBinding: 'Ctrl+L',
            action: () => {
                const security = useSecurityStore.getState();
                if (
                    security.app_lock_enabled &&
                    security.app_lock_configured &&
                    !security.app_locked
                ) {
                    void security.lockApp();
                }
            },
        },
        {
            id: 'app.reload',
            label: 'Reload Application',
            category: 'App',
            defaultBinding: 'Ctrl+Shift+R',
            action: () => {
                WindowReloadApp();
            },
        },
    ];
}

function getContributionStore(): Map<CommandId, CommandRegistryEntry> {
    const storeHost = globalThis as typeof globalThis & {
        __zentroCommandContributions__?: Map<CommandId, CommandRegistryEntry>;
    };

    if (!storeHost.__zentroCommandContributions__) {
        storeHost.__zentroCommandContributions__ = new Map<CommandId, CommandRegistryEntry>();
    }

    return storeHost.__zentroCommandContributions__;
}

export function registerCommandContribution(entry: CommandRegistryEntry): () => void {
    const contributions = getContributionStore();
    contributions.set(entry.id, entry);
    return () => {
        contributions.delete(entry.id);
    };
}

export function getCommandRegistry(): CommandRegistryEntry[] {
    return [...getBaseCommandRegistry(), ...getContributionStore().values()];
}

export function getCommandById(id: CommandId): CommandRegistryEntry | undefined {
    const contributions = getContributionStore();
    if (contributions.has(id)) {
        return contributions.get(id);
    }
    return getBaseCommandRegistry().find(entry => entry.id === id);
}

export function getDefaultShortcutMap(): Record<CommandId, string> {
    return getCommandRegistry().reduce(
        (acc, item) => {
            acc[item.id] = item.defaultBinding;
            return acc;
        },
        {} as Record<CommandId, string>,
    );
}

function normalizeKeyToken(key: string): string {
    const k = key.trim().toLowerCase();
    if (k === 'control') return 'ctrl';
    if (k === 'cmd' || k === 'command') return 'meta';
    if (k === 'option') return 'alt';
    // A key event reports arrows as ArrowUp and so on, so a binding written
    // "Up" would never match what the keyboard sends.
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') return `arrow${k}`;
    return k;
}

function sortChordTokens(tokens: string[]): string[] {
    const normalized = tokens.map(normalizeKeyToken).filter(Boolean);
    const modifiers: string[] = [];
    const keys: string[] = [];
    const seen = new Set<string>();

    normalized.forEach(token => {
        if (seen.has(token)) return;
        seen.add(token);
        if (MODIFIER_ORDER[token] !== undefined) {
            modifiers.push(token);
            return;
        }
        keys.push(token);
    });

    modifiers.sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b]);
    return [...modifiers, ...keys];
}

export function normalizeBinding(binding: string): string {
    return binding
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(part =>
            sortChordTokens(
                part
                    .split('+')
                    .map(token => token.trim())
                    .filter(Boolean),
            ).join('+'),
        )
        .join(' ');
}

const CODE_TOKEN_MAP: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Slash: '/',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Space: 'space',
    Enter: 'enter',
    NumpadEnter: 'enter',
    Escape: 'escape',
    Tab: 'tab',
    Backspace: 'backspace',
    Delete: 'delete',
    ArrowUp: 'arrowup',
    ArrowDown: 'arrowdown',
    ArrowLeft: 'arrowleft',
    ArrowRight: 'arrowright',
};

// Physical-key fallback for e.code, used only when Option/Alt is held (see
// below). Covers every key class our default bindings actually use.
function codeToKeyToken(code: string): string | null {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase();
    return CODE_TOKEN_MAP[code] || null;
}

export function eventToKeyToken(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');

    // On macOS, holding Option remaps e.key to a dead-key/accented character
    // (e.g. Alt+E becomes the "´" dead key, not "e") before the app ever
    // sees a plain letter, which silently breaks every Alt-based binding.
    // e.code reports the physical key and is unaffected by that remap, so
    // prefer it whenever Alt is held.
    const codeToken = e.altKey ? codeToKeyToken(e.code) : null;
    const key = codeToken || e.key.toLowerCase();
    if (key !== 'control' && key !== 'shift' && key !== 'alt' && key !== 'meta') {
        parts.push(key);
    }
    return sortChordTokens(parts).join('+');
}
