// SPDX-License-Identifier: GPL-3.0-only

import type { AIMentionCatalog } from '../../lib/aiAssistant';

export interface MentionQuery {
    start: number;
    query: string;
}

export type MentionKind = 'schema' | 'table' | 'column';

// Shortcuts: "@t:" table, "@s:" schema, "@c:" column, "@q:" query file.
// The query-file kind is reserved; it lists nothing until line mentions land.
export type MentionPrefix = MentionKind | 'query';

const PREFIX_KINDS: Record<string, MentionPrefix> = {
    t: 'table',
    s: 'schema',
    c: 'column',
    q: 'query',
};

// parseMentionQuery splits "t:ord" into the table kind and "ord".
export function parseMentionQuery(raw: string): { kind: MentionPrefix | null; text: string } {
    const match = /^([tscq]):(.*)$/i.exec(raw);
    if (!match) return { kind: null, text: raw };
    return { kind: PREFIX_KINDS[match[1].toLowerCase()], text: match[2] };
}

export interface MentionCandidate {
    // label is what the list shows. value is what goes after @ in the message.
    label: string;
    value: string;
    kind: MentionKind;
}

const MAX_CANDIDATES = 12;

// findMentionQuery returns the @word the caret sits in, or null.
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
    const before = text.slice(0, caret);
    const match = /(^|\s)@([A-Za-z0-9_.:-]*)$/.exec(before);
    if (!match) return null;
    return { start: caret - match[2].length - 1, query: match[2] };
}

// insertMention replaces the @query before the caret with @value and a space.
export function insertMention(text: string, found: MentionQuery, caret: number, value: string) {
    const next = `${text.slice(0, found.start)}@${value} ${text.slice(caret)}`;
    return { text: next, caret: found.start + value.length + 2 };
}

// allMentionCandidates lists the schema, its tables, and each table's columns.
export function allMentionCandidates(catalog: AIMentionCatalog | null): MentionCandidate[] {
    if (!catalog) return [];
    const out: MentionCandidate[] = [];
    if (catalog.schema) {
        out.push({ label: catalog.schema, value: catalog.schema, kind: 'schema' });
    }
    for (const table of catalog.tables) {
        out.push({ label: table.name, value: table.name, kind: 'table' });
        for (const column of table.columns) {
            out.push({
                label: `${table.name}.${column}`,
                value: `${table.name}.${column}`,
                kind: 'column',
            });
        }
    }
    return out;
}

// mentionCandidates filters the catalog by the text after @. Matches that
// start with the query come first, so typing a table name shows it on top.
export function mentionCandidates(
    catalog: AIMentionCatalog | null,
    query: string,
): MentionCandidate[] {
    const { kind, text } = parseMentionQuery(query);
    if (kind === 'query') return [];
    const needle = text.toLowerCase();
    const items = allMentionCandidates(catalog).filter(
        item => (kind === null || item.kind === kind) && item.label.toLowerCase().includes(needle),
    );
    items.sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts;
    });
    return items.slice(0, MAX_CANDIDATES);
}

// extractMentions returns the names typed as @name that exist in the catalog.
// Unknown names are dropped here, and the backend checks again.
export function extractMentions(text: string, catalog: AIMentionCatalog | null): string[] {
    const known = new Set(allMentionCandidates(catalog).map(item => item.value.toLowerCase()));
    const found: string[] = [];
    for (const match of text.matchAll(/(^|\s)@(?:[tsc]:)?([A-Za-z0-9_.]+)/gi)) {
        const name = match[2];
        if (known.has(name.toLowerCase()) && !found.includes(name)) found.push(name);
    }
    return found;
}
