// SPDX-License-Identifier: GPL-3.0-only

/** Plugin extension point registry, contracts, and slot components. */

export type {
    PluginCapability,
    PluginCommandCategory,
    PluginMenuItem,
    PluginManifest,
    PluginCommandContribution,
    PluginDataProviderContribution,
    PluginMenuContribution,
    PluginContribution,
    ResolvedPluginCommand,
    ToolbarExtension,
    ToolbarSlotProps,
    SidebarPanelExtension,
    ResultPanelExtension,
    CellRendererExtension,
    DatabaseExplorerNodeExtension,
    CommandContribution,
} from './contracts';

export { usePluginCommandBridge } from './usePluginCommandBridge';
export { ToolbarSlot } from './ToolbarSlot';
export { PluginErrorBoundary } from './PluginErrorBoundary';

export {
    validateManifest,
    registerPluginContribution,
    listPluginContributions,
    isPluginIdRegistered,
    canAccessCapability,
    listByCapability,
    resolvePluginCommands,
    resolvePluginCommandsSafe,
    registerToolbarItem,
    getToolbarItems,
    registerResultPanelExtension,
    getResultPanelExtension,
    registerCellRenderer,
    getCellRenderer,
    registerDatabaseExplorerNodeExtension,
    getDatabaseExplorerNodeExtension,
} from './registry';

export { pluginRegistry } from './pluginRegistry';
