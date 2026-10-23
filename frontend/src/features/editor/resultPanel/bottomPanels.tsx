// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Radio, ScrollText, Terminal } from 'lucide-react';
import { registerBottomPanel } from './bottomPanelRegistry';
import { ResultPanelLogPane } from './ResultPanelLogPane';

let builtInBottomPanelsRegistered = false;

// Audit/Output/App Log all render the same ResultPanelLogPane — it already
// branches internally on the active bottom-panel id (read from layoutStore),
// so registering three ids that each render it is enough to get three
// independent tabs without splitting the shared filter-bar/audit-query logic
// into three files.
export function registerBuiltInBottomPanels(): void {
    if (builtInBottomPanelsRegistered) return;

    registerBottomPanel({
        id: 'audit',
        label: 'Audit',
        title: 'Audit (Ctrl+Shift+L)',
        icon: ScrollText,
        order: 10,
        render: () => <ResultPanelLogPane />,
        commandId: 'layout.toggleAuditLog',
    });
    registerBottomPanel({
        id: 'realtime',
        label: 'Output',
        title: 'Output',
        icon: Radio,
        order: 20,
        render: () => <ResultPanelLogPane />,
    });
    registerBottomPanel({
        id: 'debug',
        label: 'App Log',
        title: 'App Log',
        icon: Terminal,
        order: 30,
        render: () => <ResultPanelLogPane />,
    });
    // The Query Stats panel is Pro (frontend/src/pro/queryStats); it registers
    // itself under id 'stats' from pro/index.tsx, which this build may not have.

    builtInBottomPanelsRegistered = true;
}
