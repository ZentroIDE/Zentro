// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { pluginRegistry } from './pluginRegistry';
import {
    getSidebarPanels,
    unregisterSidebarPanel,
} from '../../components/sidebar/sidebarPanelRegistry';
import { resolveExecutionStrategy, type ExecutionStrategy } from '../../lib/executionStrategies';
import { resolveTabFactory, type TabFactory } from '../tabFactory';
import { getCommandById } from '../../lib/shortcutRegistry';

const cleanupCallbacks: Array<() => void> = [];

afterEach(() => {
    while (cleanupCallbacks.length > 0) {
        cleanupCallbacks.pop()?.();
    }
    unregisterSidebarPanel('primary', 'plugin-sidebar');
});

describe('pluginRegistry', () => {
    it('bridges toolbar registry through the unified surface', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerToolbarItem({
                pluginId: 'plugin.test',
                slot: 'toolbar-right',
                component: () => null,
            }),
        );

        expect(pluginRegistry.getToolbarItems('toolbar-right')).toHaveLength(1);
    });

    it('registers sidebar panels through the unified surface', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerSidebarPanel({
                id: 'plugin-sidebar',
                pluginId: 'plugin.test',
                side: 'primary',
                label: 'Plugin Sidebar',
                icon: (() => null) as never,
                render: () => null,
            }),
        );

        expect(getSidebarPanels('primary').some(panel => panel.id === 'plugin-sidebar')).toBe(true);
    });

    it('registers execution strategies through the unified surface', () => {
        const strategy: ExecutionStrategy = {
            id: 'plugin-strategy',
            onPreExecute: () => undefined,
            resolveQuery: () => 'select 1',
        };

        pluginRegistry.registerExecutionStrategy(strategy);
        expect(resolveExecutionStrategy('plugin-strategy')).toBe(strategy);
    });

    it('registers tab factories through the unified surface', () => {
        const factory: TabFactory = {
            type: 'plugin-tab',
            create: () => ({ name: 'Plugin Tab' }),
        };

        pluginRegistry.registerTabFactory(factory);
        expect(resolveTabFactory('plugin-tab')).toBe(factory);
    });

    it('registers command contributions through the unified surface', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerCommand({
                id: 'ext.plugin.command',
                pluginId: 'plugin.test',
                label: 'Plugin Command',
                category: 'App',
                defaultBinding: 'Ctrl+Alt+P',
                action: () => undefined,
            }),
        );

        expect(getCommandById('ext.plugin.command')?.label).toBe('Plugin Command');
    });

    it('stores adapter overrides through the unified surface', () => {
        cleanupCallbacks.push(pluginRegistry.registerAdapterOverride('query', { mode: 'mock' }));

        expect(pluginRegistry.getAdapterOverride<{ mode: string }>('query')).toEqual({
            mode: 'mock',
        });
    });

    it('registers result panel, cell renderer, and database explorer seams through the unified surface', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerResultPanel({
                pluginId: 'plugin.test',
                resultType: 'table',
                component: () => null,
            }),
        );
        cleanupCallbacks.push(
            pluginRegistry.registerCellRenderer({
                pluginId: 'plugin.test',
                dataType: 'jsonb',
                component: () => null,
            }),
        );
        cleanupCallbacks.push(
            pluginRegistry.registerDatabaseExplorerItem({
                pluginId: 'plugin.test',
                nodeType: 'object:tables',
                component: () => null,
            }),
        );

        expect(pluginRegistry.getResultPanel('table')).toBeDefined();
        expect(pluginRegistry.getCellRenderer('jsonb')).toBeDefined();
        expect(pluginRegistry.getDatabaseExplorerItem('object:tables')).toBeDefined();
    });
});
