// SPDX-License-Identifier: GPL-3.0-only

const SCHEMA_REFRESH_SUFFIX_RE = /\s*\/\*\s*zentro:schema-rev:\d+\s*\*\/\s*$/i;

export function applySchemaRefreshRevision(baseQuery: string, revision: number): string {
    return `${baseQuery.replace(SCHEMA_REFRESH_SUFFIX_RE, '').trim()} /* zentro:schema-rev:${revision} */`;
}
