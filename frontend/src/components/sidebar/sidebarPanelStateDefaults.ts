// SPDX-License-Identifier: GPL-3.0-only

export const EXPLORER_PANEL_STATE_DEFAULT = {
    filter: '',
    fuzzyMatch: false,
    activeCategoryKey: 'tables',
    selectedSchema: '__all_schemas__',
    showMoreCategories: false,
};

export const LOGS_PANEL_STATE_DEFAULT = {
    activeView: 'audit' as 'audit' | 'realtime' | 'debug',
    search: '',
    statusFilter: '' as '' | 'success' | 'error',
    environmentFilter: 'all',
};

export const BOOKMARK_PANEL_STATE_DEFAULT = {
    scope: 'current' as 'current' | 'global',
    collapsedKeys: {} as Record<string, boolean>,
};

export const SOURCE_CONTROL_PANEL_STATE_DEFAULT = {
    search: '',
};

export const ROW_DETAIL_PANEL_STATE_DEFAULT = {
    viewMode: 'form' as 'form' | 'json',
    isSelectMode: false,
};

export const QUERY_STATS_PANEL_STATE_DEFAULT = {
    activeTab: 'impact' as 'impact' | 'frequent',
    profileFilter: '',
    driverFilter: '',
};
