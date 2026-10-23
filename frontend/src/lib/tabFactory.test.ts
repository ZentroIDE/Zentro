// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { TAB_TYPE, GENERATED_KIND } from './constants';
import {
    createQueryTab,
    createSettingsTab,
    createShortcutsTab,
    createTableTab,
    createCompareTab,
    createGitDiffTab,
    createScriptTab,
    createExplainTab,
    createReadOnlyQueryTab,
    registerTabFactory,
    resolveTabFactory,
} from './tabFactory';
import type { TabFactory } from './tabFactory';

describe('tabFactory', () => {
    describe('createQueryTab', () => {
        it('creates a minimal query tab with defaults', () => {
            const tab = createQueryTab();
            expect(tab).toEqual({
                type: TAB_TYPE.QUERY,
                name: 'New Query',
                query: '',
                context: undefined,
            });
        });

        it('creates a query tab with name and query', () => {
            const tab = createQueryTab('My Query', 'SELECT 1');
            expect(tab).toEqual({
                type: TAB_TYPE.QUERY,
                name: 'My Query',
                query: 'SELECT 1',
                context: undefined,
            });
        });

        it('creates a query tab with context', () => {
            const tab = createQueryTab('Test', 'SELECT * FROM t', {
                scriptProjectId: 'proj-1',
                scriptConnectionName: 'conn-1',
            });
            expect(tab.type).toBe(TAB_TYPE.QUERY);
            expect(tab.context?.scriptProjectId).toBe('proj-1');
            expect(tab.context?.scriptConnectionName).toBe('conn-1');
        });
    });

    describe('createSettingsTab', () => {
        it('creates a settings tab', () => {
            expect(createSettingsTab()).toEqual({
                type: TAB_TYPE.SETTINGS,
                name: 'Settings',
            });
        });
    });

    describe('createShortcutsTab', () => {
        it('creates a shortcuts tab', () => {
            expect(createShortcutsTab()).toEqual({
                type: TAB_TYPE.SHORTCUTS,
                name: 'Keyboard Shortcuts',
            });
        });
    });

    describe('createTableTab', () => {
        it('creates a table tab with qualified name', () => {
            const tab = createTableTab('public.users');
            expect(tab).toEqual({
                type: TAB_TYPE.TABLE,
                name: 'public.users',
                content: 'public.users',
                query: '',
            });
        });
    });

    describe('createCompareTab', () => {
        it('creates a compare tab with default name', () => {
            expect(createCompareTab()).toEqual({
                type: TAB_TYPE.COMPARE,
                name: 'Schema Diff',
            });
        });

        it('creates a compare tab with custom name', () => {
            expect(createCompareTab('My Diff')).toEqual({
                type: TAB_TYPE.COMPARE,
                name: 'My Diff',
            });
        });
    });

    describe('createGitDiffTab', () => {
        it('creates a git diff tab', () => {
            expect(createGitDiffTab()).toEqual({
                type: TAB_TYPE.GIT_DIFF,
                name: 'Git Diff',
                readOnly: true,
            });
        });
    });

    describe('createScriptTab', () => {
        it('creates a tab from saved script metadata', () => {
            const tab = createScriptTab('My Script', 'SELECT 1', 'script-1', 'proj-1', 'conn-1');
            expect(tab).toEqual({
                type: TAB_TYPE.QUERY,
                name: 'My Script',
                query: 'SELECT 1',
                context: {
                    savedScriptId: 'script-1',
                    scriptProjectId: 'proj-1',
                    scriptConnectionName: 'conn-1',
                },
            });
        });
    });

    describe('createExplainTab', () => {
        it('creates a non-analyze explain tab', () => {
            const tab = createExplainTab('tab-1', false);
            expect(tab).toEqual({
                id: 'tab-1::explain:plan',
                name: 'Explain',
                type: TAB_TYPE.QUERY,
                sourceTabId: 'tab-1',
                generatedKind: GENERATED_KIND.EXPLAIN,
                readOnly: true,
            });
        });

        it('creates an analyze explain tab', () => {
            const tab = createExplainTab('tab-1', true);
            expect(tab).toEqual({
                id: 'tab-1::explain:analyze',
                name: 'Explain (Analyze)',
                type: TAB_TYPE.QUERY,
                sourceTabId: 'tab-1',
                generatedKind: GENERATED_KIND.EXPLAIN,
                readOnly: true,
            });
        });
    });

    describe('createReadOnlyQueryTab', () => {
        it('creates a read-only query tab', () => {
            const tab = createReadOnlyQueryTab('Info', 'SELECT version()');
            expect(tab).toEqual({
                type: TAB_TYPE.QUERY,
                name: 'Info',
                query: 'SELECT version()',
                readOnly: true,
            });
        });
    });

    describe('registerTabFactory / resolveTabFactory', () => {
        it('registers and resolves a custom tab factory', () => {
            const custom: TabFactory = {
                type: 'my-custom',
                create: () => ({
                    type: TAB_TYPE.QUERY,
                    name: 'Custom',
                    query: 'SELECT 1',
                }),
            };
            registerTabFactory(custom);
            const resolved = resolveTabFactory('my-custom');
            expect(resolved).toBe(custom);
            expect(resolved?.create({})).toEqual({
                type: TAB_TYPE.QUERY,
                name: 'Custom',
                query: 'SELECT 1',
            });
        });

        it('returns undefined for unregistered type', () => {
            expect(resolveTabFactory('non-existent')).toBeUndefined();
        });
    });
});
