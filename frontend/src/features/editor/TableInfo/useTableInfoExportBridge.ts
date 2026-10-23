// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { DOM_EVENT } from '../../../lib/constants';
import { emitCommand, useTabScopedCommand } from '../../../lib/commandBus';
import type { TableInfoTab } from './types';

interface UseTableInfoExportBridgeArgs {
    tabId: string;
    dataTabId: string;
    activeTab: TableInfoTab;
    dataResult: unknown;
    loadData: () => Promise<void>;
    setActiveTab: React.Dispatch<React.SetStateAction<TableInfoTab>>;
}

export function useTableInfoExportBridge({
    tabId,
    dataTabId,
    activeTab,
    dataResult,
    loadData,
    setActiveTab,
}: UseTableInfoExportBridgeArgs) {
    const [pendingOpenExport, setPendingOpenExport] = React.useState(false);

    useTabScopedCommand(
        DOM_EVENT.OPEN_TABLE_EXPORT,
        tabId,
        () => {
            setActiveTab('data');
            setPendingOpenExport(true);
            if (!dataResult) {
                void loadData();
            }
        },
        { getScopeId: detail => detail?.tableTabId },
    );

    // Two-step protocol: OPEN_TABLE_EXPORT (scoped to this table tab) switches
    // to the data sub-tab, then re-emits OPEN_RESULT_EXPORT scoped to the data
    // tab's own id once that sub-tab is active, so useResultPanelCommands (which
    // only knows about result tabs, not table tabs) can open the export modal.
    React.useEffect(() => {
        if (!pendingOpenExport || activeTab !== 'data') return;
        const timer = window.setTimeout(() => {
            emitCommand(DOM_EVENT.OPEN_RESULT_EXPORT, { tabId: dataTabId });
            setPendingOpenExport(false);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activeTab, dataTabId, pendingOpenExport]);
}
