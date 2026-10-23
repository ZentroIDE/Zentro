// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SidebarSide } from '../../stores/sidebarUiStore';
import type { CommandCategory, CommandId } from '../../lib/shortcutRegistry';

export type PluginCapability = 'ui.commands' | 'ui.menu' | 'data.providers';

export type PluginCommandCategory = 'Editor' | 'Layout' | 'Connection' | 'View' | 'App';

export interface PluginMenuItem {
    id: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    hasBadge?: boolean;
    action: () => void | Promise<void>;
}

export interface PluginManifest {
    id: string;
    version: string;
    minAppVersion: string;
    capabilities: readonly PluginCapability[];
}

export interface PluginCommandContribution {
    id: `ext.${string}`;
    title: string;
    category: PluginCommandCategory;
    defaultBinding: string;
    defaultWhen?: string;
    handlerKey: string;
}

export interface PluginDataProviderContribution {
    id: string;
    resourceTypes: string[];
    queryHook: string;
}

export interface PluginMenuContribution {
    sectionId: string;
    sectionTitle?: string;
    item: PluginMenuItem;
}

export interface PluginContribution {
    manifest: PluginManifest;
    commands?: PluginCommandContribution[];
    dataProviders?: PluginDataProviderContribution[];
    menus?: PluginMenuContribution[];
}

export interface ResolvedPluginCommand {
    pluginId: string;
    entry: {
        id: `ext.${string}`;
        label: string;
        category: PluginCommandCategory;
        defaultBinding: string;
        defaultWhen?: string;
        action: () => void | Promise<void>;
    };
}

/* ── Extension Point Interfaces ────────────────────────── */

export interface ToolbarSlotProps {
    slot: 'toolbar-left' | 'toolbar-center' | 'toolbar-right';
}

export interface ToolbarExtension {
    pluginId: string;
    slot: ToolbarSlotProps['slot'];
    component: ComponentType<Record<string, never>>;
    isEnabled?: () => boolean;
    priority?: number;
}

export interface SidebarPanelExtension {
    id: string;
    pluginId: string;
    side: SidebarSide;
    label: string;
    icon: LucideIcon;
    order?: number;
    render: () => ReactNode;
    getBadge?: () => string | number | null | undefined;
}

export interface BottomPanelExtension {
    id: string;
    pluginId: string;
    label: string;
    /** Hover tooltip, e.g. "Audit (Ctrl+Shift+L)". */
    title: string;
    icon: LucideIcon;
    order?: number;
    render: () => ReactNode;
    getBadge?: () => string | number | null | undefined;
    /** Optional dedicated toggle command, registered separately via shortcutRegistry.ts. */
    commandId?: CommandId;
}

export interface ResultPanelExtension {
    pluginId: string;
    resultType: string;
    component: ComponentType<Record<string, unknown>>;
    icon?: ComponentType<{ size?: number }>;
}

export interface CellRendererExtension {
    pluginId: string;
    dataType: string | RegExp;
    component: ComponentType<{ value: unknown; row: Record<string, unknown> }>;
    priority?: number;
}

export interface DatabaseExplorerNodeExtension {
    pluginId: string;
    nodeType: string;
    component: ComponentType<{ node: unknown }>;
    contextMenuItems?: Array<{
        id: string;
        label: string;
        action: () => void;
    }>;
}

export interface CommandContribution {
    id: `ext.${string}`;
    pluginId: string;
    label: string;
    category: CommandCategory;
    defaultBinding: string;
    defaultWhen?: string;
    action: () => void | Promise<void>;
    isEnabled?: () => boolean;
}
