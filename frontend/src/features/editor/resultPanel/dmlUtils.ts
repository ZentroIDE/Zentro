// SPDX-License-Identifier: GPL-3.0-only

import { DmlType } from '../../../lib/enums';

export { DmlType };

export interface DmlMeta {
    type: DmlType;
    tableName?: string;
    label: string;
    verb: string;
}

export function parseDmlMeta(sql: string): DmlMeta {
    let cleaned = sql;

    // Loop to remove any leading comments (block or single line) and whitespace
    while (true) {
        const prev = cleaned;
        cleaned = cleaned.trimStart();

        // Strip leading block comments
        if (cleaned.startsWith('/*')) {
            const endIdx = cleaned.indexOf('*/');
            if (endIdx !== -1) {
                cleaned = cleaned.substring(endIdx + 2);
                continue;
            }
        }

        // Strip leading single-line comments starting with --
        if (cleaned.startsWith('--')) {
            const endIdx = cleaned.indexOf('\n');
            if (endIdx !== -1) {
                cleaned = cleaned.substring(endIdx + 1);
                continue;
            } else {
                cleaned = '';
            }
        }

        // Strip leading single-line comments starting with #
        if (cleaned.startsWith('#')) {
            const endIdx = cleaned.indexOf('\n');
            if (endIdx !== -1) {
                cleaned = cleaned.substring(endIdx + 1);
                continue;
            } else {
                cleaned = '';
            }
        }

        if (cleaned === prev) {
            break;
        }
    }

    const trimmed = cleaned.trim();
    const upper = trimmed.toUpperCase();

    if (/^BEGIN\b/.test(upper)) return { type: DmlType.BEGIN, verb: 'affected', label: 'BEGIN' };
    if (/^COMMIT\b/.test(upper)) return { type: DmlType.COMMIT, verb: 'affected', label: 'COMMIT' };
    if (/^ROLLBACK\b/.test(upper))
        return { type: DmlType.ROLLBACK, verb: 'affected', label: 'ROLLBACK' };

    const updateMatch = trimmed.match(/^UPDATE\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))/i);
    if (updateMatch) {
        const tableName = updateMatch[1] ?? updateMatch[2] ?? updateMatch[3] ?? updateMatch[4];
        return { type: DmlType.UPDATE, tableName, verb: 'updated', label: 'UPDATE' };
    }

    const insertMatch = trimmed.match(
        /^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))/i,
    );
    if (insertMatch) {
        const tableName = insertMatch[1] ?? insertMatch[2] ?? insertMatch[3] ?? insertMatch[4];
        return { type: DmlType.INSERT, tableName, verb: 'inserted', label: 'INSERT' };
    }

    const deleteMatch = trimmed.match(
        /^DELETE\s+FROM\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))/i,
    );
    if (deleteMatch) {
        const tableName = deleteMatch[1] ?? deleteMatch[2] ?? deleteMatch[3] ?? deleteMatch[4];
        return { type: DmlType.DELETE, tableName, verb: 'deleted', label: 'DELETE' };
    }

    return { type: DmlType.OTHER, verb: 'affected', label: 'QUERY' };
}
