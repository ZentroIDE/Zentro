// SPDX-License-Identifier: GPL-3.0-only

import {
    getCellRenderer,
    getDatabaseExplorerNodeExtension,
    getResultPanelExtension,
    getToolbarItems,
    registerCellRenderer,
    registerDatabaseExplorerNodeExtension,
    registerPluginContribution,
    registerResultPanelExtension,
    registerToolbarItem,
    validateManifest,
} from './registry';
import type {
    BottomPanelExtension,
    CellRendererExtension,
    CommandContribution,
    DatabaseExplorerNodeExtension,
    PluginContribution,
    PluginManifest,
    ResultPanelExtension,
    SidebarPanelExtension,
    ToolbarExtension,
} from './contracts';
import {
    getSidebarPanels,
    registerSidebarPanel,
    unregisterSidebarPanel,
} from '../../components/sidebar/sidebarPanelRegistry';
import {
    getBottomPanels,
    registerBottomPanel,
    unregisterBottomPanel,
} from '../../features/editor/resultPanel/bottomPanelRegistry';
import {
    registerHistorySection,
    type HistorySectionDefinition,
} from '../../components/sidebar/sourceControl/historySectionRegistry';
import {
    registerExecutionStrategy,
    resolveExecutionStrategy,
    type ExecutionStrategy,
} from '../../lib/executionStrategies';
import { registerTabFactory, resolveTabFactory, type TabFactory } from '../tabFactory';
import { registerCommandContribution } from '../../lib/shortcutRegistry';
import type { SidebarSide } from '../../stores/sidebarUiStore';

const ADAPTER_OVERRIDE_KEY = '__zentroPluginAdapterOverrides__';

function getAdapterOverrideStore(): Map<string, unknown> {
    const host = globalThis as typeof globalThis & {
        [ADAPTER_OVERRIDE_KEY]?: Map<string, unknown>;
    };

    if (!host[ADAPTER_OVERRIDE_KEY]) {
        host[ADAPTER_OVERRIDE_KEY] = new Map<string, unknown>();
    }

    return host[ADAPTER_OVERRIDE_KEY];
}

export const pluginRegistry = {
    validateManifest,
    registerPluginContribution(contribution: PluginContribution): () => void {
        return registerPluginContribution(contribution);
    },
    loadPlugin(manifest: PluginContribution): () => void {
        return registerPluginContribution(manifest);
    },
    unloadPlugin(dispose: () => void): void {
        dispose();
    },
    registerToolbarItem(extension: ToolbarExtension): () => void {
        return registerToolbarItem(extension);
    },
    getToolbarItems(slot: ToolbarExtension['slot']): ToolbarExtension[] {
        return getToolbarItems(slot);
    },
    registerSidebarPanel(extension: SidebarPanelExtension): () => void {
        registerSidebarPanel({
            id: extension.id,
            side: extension.side,
            label: extension.label,
            icon: extension.icon,
            order: extension.order ?? 0,
            render: extension.render,
            getBadge: extension.getBadge,
        });

        return () => {
            unregisterSidebarPanel(extension.side, extension.id);
        };
    },
    getSidebarPanels(side: SidebarSide) {
        return getSidebarPanels(side);
    },
    registerBottomPanel(extension: BottomPanelExtension): () => void {
        registerBottomPanel({
            id: extension.id,
            label: extension.label,
            title: extension.title,
            icon: extension.icon,
            order: extension.order ?? 0,
            render: extension.render,
            getBadge: extension.getBadge,
            commandId: extension.commandId,
        });

        return () => {
            unregisterBottomPanel(extension.id);
        };
    },
    getBottomPanels() {
        return getBottomPanels();
    },
    registerSourceControlHistorySection(extension: HistorySectionDefinition): () => void {
        return registerHistorySection(extension);
    },
    registerResultPanel(extension: ResultPanelExtension): () => void {
        return registerResultPanelExtension(extension);
    },
    getResultPanel(resultType: string): ResultPanelExtension | undefined {
        return getResultPanelExtension(resultType);
    },
    registerCellRenderer(extension: CellRendererExtension): () => void {
        return registerCellRenderer(extension);
    },
    getCellRenderer(dataType: string): CellRendererExtension | undefined {
        return getCellRenderer(dataType);
    },
    registerDatabaseExplorerItem(extension: DatabaseExplorerNodeExtension): () => void {
        return registerDatabaseExplorerNodeExtension(extension);
    },
    getDatabaseExplorerItem(nodeType: string): DatabaseExplorerNodeExtension | undefined {
        return getDatabaseExplorerNodeExtension(nodeType);
    },
    registerExecutionStrategy(strategy: ExecutionStrategy): void {
        registerExecutionStrategy(strategy);
    },
    resolveExecutionStrategy(source: string): ExecutionStrategy {
        return resolveExecutionStrategy(source);
    },
    registerTabFactory(factory: TabFactory): void {
        registerTabFactory(factory);
    },
    resolveTabFactory(type: string): TabFactory | undefined {
        return resolveTabFactory(type);
    },
    registerCommand(command: CommandContribution): () => void {
        return registerCommandContribution({
            id: command.id,
            label: command.label,
            category: command.category,
            defaultBinding: command.defaultBinding,
            defaultWhen: command.defaultWhen,
            action: command.action,
            isEnabled: command.isEnabled,
        });
    },
    registerAdapterOverride<T>(key: string, implementation: T): () => void {
        const store = getAdapterOverrideStore();
        store.set(key, implementation);
        return () => {
            store.delete(key);
        };
    },
    getAdapterOverride<T>(key: string): T | undefined {
        return getAdapterOverrideStore().get(key) as T | undefined;
    },
} as const;

export type PluginRegistry = typeof pluginRegistry;
export type { PluginManifest };
