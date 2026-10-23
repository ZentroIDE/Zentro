// SPDX-License-Identifier: GPL-3.0-only

import type { app } from '../../../../wailsjs/go/models';
import { useEditorStore } from '../../../stores/editorStore';
import { TAB_TYPE } from '../../../lib/constants';

export function pasteAuditEntry(entry: app.SQLAuditEntry) {
    const { groups, activeGroupId, addTab, setTabQuery } = useEditorStore.getState();
    const activeGroup = groups.find(g => g.id === activeGroupId);
    const activeTabId = activeGroup?.activeTabId;
    const activeTab = activeGroup?.tabs.find(t => t.id === activeTabId);

    const sql = entry.statement_text.trim();
    if (!sql) return;

    if (activeTabId && activeGroupId && activeTab?.type === TAB_TYPE.QUERY) {
        const current = activeTab.query || '';
        const separator = current.trimEnd() ? '\n\n' : '';
        setTabQuery(activeTabId, `${current.trimEnd()}${separator}${sql}`);
    } else {
        addTab({ query: sql });
    }
}

export function copyAuditEntry(entry: app.SQLAuditEntry) {
    navigator.clipboard.writeText(entry.statement_text).catch(() => {});
}

export function openAuditEntryInNewTab(entry: app.SQLAuditEntry) {
    const { addTab } = useEditorStore.getState();
    addTab({ query: entry.statement_text.trim() });
}
