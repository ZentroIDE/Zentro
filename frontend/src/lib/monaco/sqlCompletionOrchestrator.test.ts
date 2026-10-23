// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { useTemplateStore } from '../../stores/templateStore';
import { buildEditorCompletionPlan, resolveCompletionCatalog } from './sqlCompletionOrchestrator';

const publicCatalog = [{ Name: 'public', Tables: ['categories'], Views: [] }];

describe('resolveCompletionCatalog', () => {
    it('prefers the exact active profile and database key', () => {
        const exact = [{ Name: 'public', Tables: ['orders'], Views: [] }];
        expect(
            resolveCompletionCatalog(
                {
                    'main:northwind': exact,
                    'legacy:northwind': publicCatalog,
                },
                'main',
                'northwind',
            ),
        ).toBe(exact);
    });

    it('uses a unique loaded catalog for the active database when profile aliases differ', () => {
        expect(
            resolveCompletionCatalog(
                {
                    'northwind:northwind': publicCatalog,
                    'analytics:warehouse': [{ Name: 'public', Tables: ['events'], Views: [] }],
                },
                'northwind-project',
                'northwind',
            ),
        ).toBe(publicCatalog);
    });

    it('does not leak tables when multiple catalogs match the same database', () => {
        expect(
            resolveCompletionCatalog(
                {
                    'local:northwind': publicCatalog,
                    'remote:northwind': [
                        { Name: 'public', Tables: ['sensitive_orders'], Views: [] },
                    ],
                },
                'missing',
                'northwind',
            ),
        ).toEqual([]);
    });
});

describe('buildEditorCompletionPlan built-in templates', () => {
    const useProfile = (driver: string) =>
        useConnectionStore.setState({
            activeProfile: { name: 'main', db_name: 'db', driver } as never,
        });
    const suggest = async () => {
        const result = await buildEditorCompletionPlan({
            sqlText: 'se',
            cursorOffset: 2,
            currentWord: 'se',
            range: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 3 },
            editorFlavor: 'main',
        });
        return result.candidates;
    };

    afterEach(() => {
        useConnectionStore.setState({ activeProfile: null });
        useTemplateStore.setState({ templates: [] });
        useSchemaStore.setState({ trees: {} });
    });

    it('offers the dialect-specific built-in template', async () => {
        useSchemaStore.setState({ trees: { 'main:db': publicCatalog as never } });
        useProfile('sqlserver');

        const sel = (await suggest()).find(candidate => candidate.label === 'sel');

        expect(sel?.item.insertText).toBe('SELECT TOP 100 *\nFROM ${1:table}$0');
        expect(sel?.item.detail).toBe('Built-in: Select first 100 rows');
    });

    it('lets a user template with the same trigger replace the built-in', async () => {
        useSchemaStore.setState({ trees: { 'main:db': publicCatalog as never } });
        useProfile('postgres');
        useTemplateStore.setState({
            templates: [{ id: '1', name: 'Mine', trigger: 'sel', content: 'SELECT 1' }] as never,
        });

        const matches = (await suggest()).filter(candidate => candidate.label === 'sel');

        expect(matches).toHaveLength(1);
        expect(matches[0].item.insertText).toBe('SELECT 1');
    });
});
