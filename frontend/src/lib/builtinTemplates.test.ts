// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getBuiltinTemplates, mergeWithBuiltinTemplates } from './builtinTemplates';

const contentOf = (driver: string, trigger: string) =>
    getBuiltinTemplates(driver).find(template => template.trigger === trigger)?.content;

describe('getBuiltinTemplates', () => {
    it('uses TOP on SQL Server, including its mssql alias', () => {
        expect(contentOf('sqlserver', 'sel')).toBe('SELECT TOP 100 *\nFROM ${1:table}$0');
        expect(contentOf('mssql', 'sel')).toBe('SELECT TOP 100 *\nFROM ${1:table}$0');
    });

    it.each(['postgres', 'mysql', 'sqlite', ''])('uses LIMIT for "%s"', driver => {
        expect(contentOf(driver, 'sel')).toBe('SELECT *\nFROM ${1:table}\nLIMIT 100$0');
    });

    it('has unique triggers and marks every template as built-in', () => {
        const templates = getBuiltinTemplates('postgres');
        const triggers = templates.map(template => template.trigger);

        expect(new Set(triggers).size).toBe(triggers.length);
        expect(templates.every(template => template.name.startsWith('Built-in: '))).toBe(true);
    });

    it('only contains snippets whose tab stops are well formed', () => {
        for (const driver of ['sqlserver', 'postgres', 'mysql', 'sqlite']) {
            for (const template of getBuiltinTemplates(driver)) {
                const stops = [...template.content.matchAll(/\$\{(\d+):[^}]+\}/g)];
                expect(stops.length).toBeGreaterThan(0);
                expect(template.content.endsWith('$0')).toBe(true);
                expect(template.content.replace(/\$\{\d+:[^}]+\}|\$0/g, '')).not.toContain('$');
            }
        }
    });
});

describe('mergeWithBuiltinTemplates', () => {
    it('keeps user templates first and appends the built-ins', () => {
        const merged = mergeWithBuiltinTemplates('postgres', [
            { trigger: 'mine', name: 'Mine', content: 'SELECT 1' },
        ]);

        expect(merged[0].trigger).toBe('mine');
        expect(merged.map(template => template.trigger)).toEqual(
            expect.arrayContaining(['mine', 'sel', 'selc', 'seld']),
        );
    });

    it('lets a user template override a built-in with the same trigger, ignoring case', () => {
        const merged = mergeWithBuiltinTemplates('postgres', [
            { trigger: 'SEL', name: 'My select', content: 'SELECT * FROM x' },
        ]);

        const selTemplates = merged.filter(template => template.trigger.toLowerCase() === 'sel');
        expect(selTemplates).toEqual([
            { trigger: 'SEL', name: 'My select', content: 'SELECT * FROM x' },
        ]);
    });

    it('returns only built-ins when the user has none', () => {
        expect(mergeWithBuiltinTemplates('sqlite', [])).toEqual(getBuiltinTemplates('sqlite'));
    });
});
