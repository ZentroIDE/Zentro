// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlignLeft, Bookmark, GitBranch, Hash, ListChecks, MessageSquare } from 'lucide-react';
import { BookmarkTab } from './BookmarkTab';
import { SourceControlPanel } from './SourceControlPanel';
import { RowDetailTab } from './RowDetailTab';
import {
    BOOKMARK_PANEL_STATE_DEFAULT,
    EXPLORER_PANEL_STATE_DEFAULT,
    ROW_DETAIL_PANEL_STATE_DEFAULT,
    SOURCE_CONTROL_PANEL_STATE_DEFAULT,
} from './sidebarPanelStateDefaults';
import { PrimaryExplorerPanel } from './panels/PrimaryExplorerPanel';
import { AssistantPanel } from '../../features/ai/AssistantPanel';
import { ChangesPanel } from '../../features/changes';
import { registerSidebarPanel } from './sidebarPanelRegistry';

let builtInPanelsRegistered = false;

export function registerBuiltInSidebarPanels(): void {
    if (builtInPanelsRegistered) return;

    registerSidebarPanel({
        id: 'explorer',
        side: 'primary',
        label: 'Explorer',
        icon: Hash,
        order: 10,
        render: () => <PrimaryExplorerPanel />,
        defaultState: EXPLORER_PANEL_STATE_DEFAULT,
    });
    registerSidebarPanel({
        id: 'source-control',
        side: 'primary',
        label: 'Source Control',
        icon: GitBranch,
        order: 40,
        render: () => <SourceControlPanel />,
        defaultState: SOURCE_CONTROL_PANEL_STATE_DEFAULT,
    });

    registerSidebarPanel({
        id: 'detail',
        side: 'secondary',
        label: 'Row Detail',
        icon: AlignLeft,
        order: 10,
        render: () => <RowDetailTab />,
        defaultState: ROW_DETAIL_PANEL_STATE_DEFAULT,
    });
    registerSidebarPanel({
        id: 'bookmark',
        side: 'secondary',
        label: 'Bookmarks',
        icon: Bookmark,
        order: 20,
        render: () => <BookmarkTab />,
        defaultState: BOOKMARK_PANEL_STATE_DEFAULT,
    });
    registerSidebarPanel({
        id: 'assistant',
        side: 'secondary',
        label: 'Assistant',
        icon: MessageSquare,
        order: 30,
        render: () => <AssistantPanel />,
        defaultState: BOOKMARK_PANEL_STATE_DEFAULT,
    });
    registerSidebarPanel({
        id: 'changes',
        side: 'secondary',
        label: 'Changes',
        icon: ListChecks,
        order: 35,
        render: () => <ChangesPanel />,
        defaultState: BOOKMARK_PANEL_STATE_DEFAULT,
    });
    builtInPanelsRegistered = true;
}
