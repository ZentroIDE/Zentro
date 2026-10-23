// SPDX-License-Identifier: GPL-3.0-only

import { TAB_TYPE } from './constants';
import { focusZone, type FocusZoneId } from './focusZoneRegistry';
import { useEditorStore } from '../stores/editorStore';
import { useEnvironmentStore } from '../stores/environmentStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useProjectStore } from '../stores/projectStore';
import { buildSidebarContextKey, useSidebarUiStore } from '../stores/sidebarUiStore';

/** Set while a focus command is waiting for a table tab to show its ERD. */
let erdRevealPending = false;

export function markErdReveal(): void {
    erdRevealPending = true;
}

/** Returns true once per pending reveal, then clears the flag. */
export function consumeErdReveal(): boolean {
    const pending = erdRevealPending;
    erdRevealPending = false;
    return pending;
}

function revealExplorer(): void {
    useLayoutStore.getState().setShowSidebar(true);
    const project = useProjectStore.getState().activeProject;
    const environmentKey =
        useEnvironmentStore.getState().activeEnvironmentKey || project?.default_environment_key;
    const contextKey = buildSidebarContextKey(project?.id, environmentKey);
    useSidebarUiStore.getState().setActivePanel(contextKey, 'primary', 'explorer');
}

function revealResultGrid(): void {
    const layout = useLayoutStore.getState();
    layout.setShowResultPanel(true);
    layout.setBottomPanelView('result');
}

function revealQueryToolbar(): void {
    const state = useEditorStore.getState();
    const group = state.groups.find(item => item.id === state.activeGroupId);
    if (!group) return;
    const active = group.tabs.find(tab => tab.id === group.activeTabId);
    if (active?.type === TAB_TYPE.QUERY) return;
    const queryTab = group.tabs.find(tab => tab.type === TAB_TYPE.QUERY);
    if (queryTab) state.setActiveTabId(queryTab.id, group.id);
}

function revealErd(): void {
    markErdReveal();
    const state = useEditorStore.getState();
    const activeGroup = state.groups.find(group => group.id === state.activeGroupId);
    const activeTab = activeGroup?.tabs.find(tab => tab.id === activeGroup.activeTabId);
    if (activeTab?.type === TAB_TYPE.TABLE) return;

    for (const group of state.groups) {
        const tableTab = group.tabs.find(tab => tab.type === TAB_TYPE.TABLE);
        if (!tableTab) continue;
        state.setActiveTabId(tableTab.id, group.id);
        return;
    }
}

function isFocusZoneId(zoneId: string): zoneId is FocusZoneId {
    return (
        zoneId === 'explorer' ||
        zoneId === 'editorToolbar' ||
        zoneId === 'resultGrid' ||
        zoneId === 'tabStrip' ||
        zoneId === 'erd'
    );
}

/** Makes the zone's panel visible before focus. Mount still happens on the next paint. */
export function prepareFocusZone(zoneId: string): void {
    if (!isFocusZoneId(zoneId)) return;
    switch (zoneId) {
        case 'explorer':
            revealExplorer();
            return;
        case 'resultGrid':
            revealResultGrid();
            return;
        case 'editorToolbar':
            revealQueryToolbar();
            return;
        case 'erd':
            revealErd();
            return;
        case 'tabStrip':
            return;
        default:
            return;
    }
}

/**
 * Reveals the zone, then focuses it. If the target mounts only after the
 * layout update, retries across a few frames.
 */
export function revealAndFocusZone(zoneId: string): void {
    if (!isFocusZoneId(zoneId)) return;
    prepareFocusZone(zoneId);
    if (focusZone(zoneId)) return;

    let attempts = 0;
    const retry = () => {
        if (focusZone(zoneId) || attempts >= 12) return;
        attempts += 1;
        requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
}
