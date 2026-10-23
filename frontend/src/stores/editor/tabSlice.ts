// SPDX-License-Identifier: GPL-3.0-only

import { StateCreator } from 'zustand';
import { TAB_TYPE } from '../../lib/constants';
import { EditorState, Tab, TabQueryContext } from './types';
import { getNextTabName, updateActiveSession } from './sessionUtils';
import { useScriptStore } from '../scriptStore';
import { useProjectStore } from '../projectStore';
import { useConnectionStore } from '../connectionStore';
import { useEnvironmentStore } from '../environmentStore';

export interface TabSlice {
    addTab: (tabInit?: Partial<Tab>, targetGroupId?: string) => string;
    removeTab: (id: string, groupId?: string) => void;
    setActiveTabId: (tabId: string, groupId: string) => void;
    updateTabQuery: (id: string, query: string) => void;
    updateTabContext: (id: string, patch: Partial<TabQueryContext>) => void;
    setTabRunning: (id: string, isRunning: boolean) => void;
    renameTab: (id: string, newName: string) => void;
    setTabQuery: (id: string, query: string) => void;
}

// With no project there is nowhere to persist a script, so only app-level tabs
// (settings, shortcuts) may open until the user creates or opens a project.
const APP_LEVEL_TAB_TYPES: ReadonlySet<string> = new Set([TAB_TYPE.SETTINGS, TAB_TYPE.SHORTCUTS]);

function isBlockedWithoutProject(tabType: string | undefined): boolean {
    const { hasBootstrapped, activeProject } = useProjectStore.getState();
    return hasBootstrapped && !activeProject && !APP_LEVEL_TAB_TYPES.has(tabType ?? TAB_TYPE.QUERY);
}

export const createTabSlice: StateCreator<EditorState, [], [], TabSlice> = set => ({
    addTab: (tabInit, targetGroupId) => {
        if (isBlockedWithoutProject(tabInit?.type)) return '';
        let id = tabInit?.id || crypto.randomUUID();

        set(state =>
            updateActiveSession(state, session => {
                const targetId = targetGroupId || session.activeGroupId || session.groups[0]?.id;
                const groupIndex = session.groups.findIndex(group => group.id === targetId);
                if (groupIndex === -1 || !targetId) {
                    return session;
                }

                if (tabInit?.id) {
                    for (const group of session.groups) {
                        const existingTab = group.tabs.find(tab => tab.id === tabInit.id);
                        if (existingTab) {
                            id = existingTab.id;
                            return {
                                groups: session.groups.map(currentGroup =>
                                    currentGroup.id !== group.id
                                        ? currentGroup
                                        : {
                                              ...currentGroup,
                                              activeTabId: existingTab.id,
                                              tabs: currentGroup.tabs.map(tab =>
                                                  tab.id === existingTab.id
                                                      ? { ...tab, ...tabInit, id: existingTab.id }
                                                      : tab,
                                              ),
                                          },
                                ),
                                activeGroupId: group.id,
                            };
                        }
                    }
                }

                if (tabInit?.type === TAB_TYPE.TABLE && tabInit.content) {
                    for (const group of session.groups) {
                        // Same qualified name under a different Pinned
                        // Environment (ADR-0001) is a different view, not a
                        // dup — reusing the old tab here would silently keep
                        // it pinned to the wrong environment.
                        const existingTab = group.tabs.find(
                            tab =>
                                tab.type === 'table' &&
                                tab.content === tabInit.content &&
                                tab.connection?.connectionID === tabInit.connection?.connectionID &&
                                tab.connection?.dbName === tabInit.connection?.dbName,
                        );
                        if (existingTab) {
                            id = existingTab.id;
                            return {
                                groups: session.groups.map(currentGroup =>
                                    currentGroup.id === group.id
                                        ? { ...currentGroup, activeTabId: existingTab.id }
                                        : currentGroup,
                                ),
                                activeGroupId: group.id,
                            };
                        }
                    }
                }

                if (tabInit?.type === 'settings' || tabInit?.type === 'shortcuts') {
                    for (const group of session.groups) {
                        const existingTab = group.tabs.find(tab => tab.type === tabInit.type);
                        if (existingTab) {
                            id = existingTab.id;
                            return {
                                groups: session.groups.map(currentGroup =>
                                    currentGroup.id === group.id
                                        ? { ...currentGroup, activeTabId: existingTab.id }
                                        : currentGroup,
                                ),
                                activeGroupId: group.id,
                            };
                        }
                    }
                }

                if (tabInit?.type === TAB_TYPE.CATALOG && tabInit.catalog) {
                    for (const group of session.groups) {
                        // Same object under a different Pinned Environment
                        // (ADR-0001) is a different view — see the Table-tab
                        // dedup check above for why connection must match too.
                        const existingTab = group.tabs.find(
                            tab =>
                                tab.type === TAB_TYPE.CATALOG &&
                                tab.catalog?.catalogPath === tabInit.catalog?.catalogPath &&
                                tab.catalog?.objectKind === tabInit.catalog?.objectKind &&
                                tab.connection?.connectionID === tabInit.connection?.connectionID &&
                                tab.connection?.dbName === tabInit.connection?.dbName,
                        );
                        if (existingTab) {
                            id = existingTab.id;
                            return {
                                groups: session.groups.map(currentGroup =>
                                    currentGroup.id === group.id
                                        ? { ...currentGroup, activeTabId: existingTab.id }
                                        : currentGroup,
                                ),
                                activeGroupId: group.id,
                            };
                        }
                    }
                }

                if (tabInit?.type === TAB_TYPE.COMPARE) {
                    for (const group of session.groups) {
                        const existingTab = group.tabs.find(tab => tab.type === TAB_TYPE.COMPARE);
                        if (existingTab) {
                            id = existingTab.id;
                            return {
                                groups: session.groups.map(currentGroup =>
                                    currentGroup.id === group.id
                                        ? {
                                              ...currentGroup,
                                              activeTabId: existingTab.id,
                                              tabs: currentGroup.tabs.map(tab =>
                                                  tab.id === existingTab.id
                                                      ? { ...tab, ...tabInit, id: existingTab.id }
                                                      : tab,
                                              ),
                                          }
                                        : currentGroup,
                                ),
                                activeGroupId: group.id,
                            };
                        }
                    }
                }

                const activeProjectId = useProjectStore.getState().activeProject?.id || null;
                const activeProject = useProjectStore.getState().activeProject;
                const activeEnvironmentKey =
                    useEnvironmentStore.getState().activeEnvironmentKey ||
                    activeProject?.last_active_environment_key ||
                    activeProject?.default_environment_key;
                // connection_ref is a pool connection ID — resolve to the
                // display name scripts are scoped by.
                const boundConnectionRef = activeProject?.environments?.find(
                    item => item.key === activeEnvironmentKey,
                )?.connection_ref;
                const boundConnectionName =
                    useConnectionStore.getState().connections.find(c => c.id === boundConnectionRef)
                        ?.name || null;
                const activeConnectionName =
                    useConnectionStore.getState().activeProfile?.name || boundConnectionName;
                const scriptState = useScriptStore.getState();
                const reservedScriptNames =
                    scriptState.activeProjectId === activeProjectId &&
                    scriptState.activeConnection === activeConnectionName
                        ? scriptState.scripts.map(script => script.name)
                        : [];

                const name =
                    tabInit?.name ||
                    (tabInit?.type === TAB_TYPE.TABLE
                        ? tabInit.content || 'Table'
                        : getNextTabName(session.groups, 'New Query', reservedScriptNames));
                const nextTabType = tabInit?.type || TAB_TYPE.QUERY;
                const mergedContext: TabQueryContext | undefined =
                    nextTabType === TAB_TYPE.QUERY
                        ? {
                              scriptProjectId: activeProjectId || undefined,
                              scriptConnectionName: activeConnectionName || undefined,
                              ...(tabInit?.context || {}),
                          }
                        : tabInit?.context;
                const newTab: Tab = {
                    id,
                    name,
                    query: tabInit?.query || '',
                    isRunning: false,
                    type: nextTabType,
                    content: tabInit?.content,
                    context: mergedContext,
                    ...tabInit,
                };

                return {
                    groups: session.groups.map(group =>
                        group.id === targetId
                            ? {
                                  ...group,
                                  tabs: [...group.tabs, newTab],
                                  activeTabId: id,
                              }
                            : group,
                    ),
                    activeGroupId: targetId,
                };
            }),
        );

        return id;
    },

    removeTab: (id, targetGroupId) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group => {
                    if (targetGroupId && group.id !== targetGroupId) return group;
                    if (!group.tabs.some(tab => tab.id === id)) return group;

                    const tabs = group.tabs.filter(tab => tab.id !== id);
                    const activeTabId =
                        group.activeTabId === id
                            ? tabs.length > 0
                                ? tabs[tabs.length - 1].id
                                : null
                            : group.activeTabId;

                    return { ...group, tabs, activeTabId };
                }),
            })),
        ),

    setActiveTabId: (tabId, groupId) =>
        set(state =>
            updateActiveSession(state, session => ({
                groups: session.groups.map(group =>
                    group.id === groupId ? { ...group, activeTabId: tabId } : group,
                ),
                activeGroupId: groupId,
            })),
        ),

    // These five actions all touch exactly one tab in exactly one group, so
    // every OTHER group (and every OTHER tab within the affected group) must
    // come back as the exact same object reference — not a fresh `{...group}`
    // copy. Zustand selectors compare by reference: an unconditional spread
    // here made every mounted tab across every group re-render on every
    // keystroke in any single tab, since `state.groups` and each `group`
    // object looked "new" even where nothing relevant had changed. This
    // mirrors the conditional-copy pattern groupSlice.ts already uses
    // correctly.
    updateTabQuery: (id, query) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group =>
                    group.tabs.some(tab => tab.id === id)
                        ? {
                              ...group,
                              tabs: group.tabs.map(tab =>
                                  tab.id === id ? { ...tab, query } : tab,
                              ),
                          }
                        : group,
                ),
            })),
        ),

    updateTabContext: (id, patch) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group =>
                    group.tabs.some(tab => tab.id === id)
                        ? {
                              ...group,
                              tabs: group.tabs.map(tab =>
                                  tab.id === id
                                      ? { ...tab, context: { ...(tab.context || {}), ...patch } }
                                      : tab,
                              ),
                          }
                        : group,
                ),
            })),
        ),

    setTabRunning: (id, isRunning) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group =>
                    group.tabs.some(tab => tab.id === id)
                        ? {
                              ...group,
                              tabs: group.tabs.map(tab =>
                                  tab.id === id ? { ...tab, isRunning } : tab,
                              ),
                          }
                        : group,
                ),
            })),
        ),

    renameTab: (id, newName) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group =>
                    group.tabs.some(tab => tab.id === id)
                        ? {
                              ...group,
                              tabs: group.tabs.map(tab =>
                                  tab.id === id && tab.type === TAB_TYPE.QUERY
                                      ? { ...tab, name: newName }
                                      : tab,
                              ),
                          }
                        : group,
                ),
            })),
        ),

    setTabQuery: (id, query) =>
        set(state =>
            updateActiveSession(state, session => ({
                ...session,
                groups: session.groups.map(group =>
                    group.tabs.some(tab => tab.id === id)
                        ? {
                              ...group,
                              tabs: group.tabs.map(tab =>
                                  tab.id === id ? { ...tab, query } : tab,
                              ),
                          }
                        : group,
                ),
            })),
        ),
});
