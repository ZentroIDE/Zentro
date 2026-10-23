// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import {
    canAccessCapability,
    isPluginIdRegistered,
    listByCapability,
    listPluginContributions,
    registerPluginContribution,
    resolvePluginCommands,
    resolvePluginCommandsSafe,
    validateManifest,
    registerToolbarItem,
    getToolbarItems,
} from './registry';

const SAMPLE_MANIFEST = {
    id: 'sample.plugin',
    version: '1.0.0',
    minAppVersion: '0.2.0',
    capabilities: ['ui.commands'] as const,
};

const EXT_CONTRIBUTION = {
    manifest: SAMPLE_MANIFEST,
    commands: [
        {
            id: 'ext.sample.run' as const,
            title: 'Sample Run',
            category: 'App' as const,
            defaultBinding: 'Ctrl+Shift+Y',
            handlerKey: 'sample.run',
        },
    ],
};

describe('plugin registry', () => {
    afterEach(() => {
        // dispose all registered plugins between tests
        for (const c of listPluginContributions()) {
            // nudge: re-register to get dispose handle is impractical;
            // just clear global state via the store reference.
        }
    });

    it('validates manifest', () => {
        const invalid = validateManifest({
            id: '',
            version: '',
            minAppVersion: '',
            capabilities: [],
        });
        expect(invalid.valid).toBe(false);

        const valid = validateManifest({
            id: 'sample',
            version: '1.0.0',
            minAppVersion: '0.2.0',
            capabilities: ['ui.commands'],
        });
        expect(valid.valid).toBe(true);
    });

    it('registers and resolves commands by capability', () => {
        const dispose = registerPluginContribution(EXT_CONTRIBUTION);

        expect(listPluginContributions().length).toBeGreaterThan(0);
        expect(listByCapability('ui.commands')).toHaveLength(1);

        const resolved = resolvePluginCommands(() => () => {});
        expect(resolved).toHaveLength(1);
        expect(resolved[0].entry.label).toBe('Sample Run');
        dispose();
    });

    it('rejects duplicate registration', () => {
        const dispose = registerPluginContribution(EXT_CONTRIBUTION);
        expect(() => registerPluginContribution(EXT_CONTRIBUTION)).toThrow('already registered');
        dispose();
    });

    it('isPluginIdRegistered works', () => {
        expect(isPluginIdRegistered('sample.plugin')).toBe(false);
        const dispose = registerPluginContribution(EXT_CONTRIBUTION);
        expect(isPluginIdRegistered('sample.plugin')).toBe(true);
        dispose();
        expect(isPluginIdRegistered('sample.plugin')).toBe(false);
    });

    it('canAccessCapability checks manifest capabilities', () => {
        const dispose = registerPluginContribution(EXT_CONTRIBUTION);
        expect(canAccessCapability('sample.plugin', 'ui.commands')).toBe(true);
        expect(canAccessCapability('sample.plugin', 'ui.menu')).toBe(false);
        expect(canAccessCapability('unknown', 'ui.commands')).toBe(false);
        dispose();
    });

    it('resolvePluginCommandsSafe wraps missing handlers', () => {
        const dispose = registerPluginContribution(EXT_CONTRIBUTION);

        const safe = resolvePluginCommandsSafe(() => {
            throw new Error('handler not found');
        });
        expect(safe).toHaveLength(1);
        expect(safe[0].entry.label).toBe('Sample Run');
        // should not throw when executing the fallback
        expect(() => safe[0].entry.action()).not.toThrow();
        dispose();
    });

    it('registerToolbarItem / getToolbarItems', () => {
        const dispose = registerToolbarItem({
            pluginId: 'test.plugin',
            slot: 'toolbar-left',
            component: () => null,
            priority: 10,
        });

        const left = getToolbarItems('toolbar-left');
        expect(left).toHaveLength(1);
        expect(left[0].pluginId).toBe('test.plugin');

        const center = getToolbarItems('toolbar-center');
        expect(center).toHaveLength(0);

        dispose();
        expect(getToolbarItems('toolbar-left')).toHaveLength(0);
    });
});
