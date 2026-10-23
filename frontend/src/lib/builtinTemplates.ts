// SPDX-License-Identifier: GPL-3.0-only

import { normalizeDriverKey } from './monaco/sqlDriverFacade';
import type { SqlTemplateLike } from './monaco/sqlCompletionTypes';
import { DRIVER } from './constants';

// Ready-made snippets for looking at data quickly. They are code, not stored
// data: they follow the connection's dialect (TOP vs LIMIT), are never written
// to templates.json, and a user template with the same trigger replaces them.
//
// `content` uses Monaco snippet syntax: `${1:table}` is a tab stop, `$0` the
// final cursor position.

interface BuiltinTemplate {
    trigger: string;
    name: string;
    /** Content per dialect; `default` covers every dialect not listed. */
    content: { default: string } & Partial<Record<string, string>>;
}

const BUILTIN_NAME_PREFIX = 'Built-in';

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
    {
        trigger: 'sel',
        name: 'Select first 100 rows',
        content: {
            [DRIVER.SQLSERVER]: 'SELECT TOP 100 *\nFROM ${1:table}$0',
            default: 'SELECT *\nFROM ${1:table}\nLIMIT 100$0',
        },
    },
    {
        trigger: 'selc',
        name: 'Count rows',
        content: { default: 'SELECT COUNT(*)\nFROM ${1:table}$0' },
    },
    {
        trigger: 'seld',
        name: 'Value distribution of a column',
        content: {
            default:
                'SELECT ${1:column}, COUNT(*) AS cnt\nFROM ${2:table}\nGROUP BY ${1:column}\nORDER BY cnt DESC$0',
        },
    },
];

export function getBuiltinTemplates(driver: string): SqlTemplateLike[] {
    const dialect = normalizeDriverKey(driver);
    return BUILTIN_TEMPLATES.map(template => ({
        trigger: template.trigger,
        name: `${BUILTIN_NAME_PREFIX}: ${template.name}`,
        content: template.content[dialect] ?? template.content.default,
    }));
}

/** Built-in templates plus the user's; a user template wins on the same trigger. */
export function mergeWithBuiltinTemplates(
    driver: string,
    userTemplates: SqlTemplateLike[],
): SqlTemplateLike[] {
    const userTriggers = new Set(userTemplates.map(template => template.trigger.toLowerCase()));
    const builtins = getBuiltinTemplates(driver).filter(
        template => !userTriggers.has(template.trigger.toLowerCase()),
    );
    return [...userTemplates, ...builtins];
}
