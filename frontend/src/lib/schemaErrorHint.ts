// SPDX-License-Identifier: GPL-3.0-only

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasQualifiedRelationReference(sql: string, relationName: string) {
    const escapedRelation = escapeRegExp(relationName);
    const patterns = [
        new RegExp(`"[^"]+"\\s*\\.\\s*"${escapedRelation}"`, 'i'),
        new RegExp(`\\b[a-z_][\\w$]*\\s*\\.\\s*"${escapedRelation}"\\b`, 'i'),
        new RegExp(`"[^"]+"\\s*\\.\\s*${escapedRelation}\\b`, 'i'),
        new RegExp(`\\b[a-z_][\\w$]*\\s*\\.\\s*${escapedRelation}\\b`, 'i'),
    ];

    return patterns.some(pattern => pattern.test(sql));
}

function isMissingRelationError(error: string) {
    return /relation\s+"[^"]+"\s+does not exist/i.test(error) && /SQLSTATE\s+42P01/i.test(error);
}

export function withSchemaContextHint(
    error: string | undefined,
    schemaName: string | undefined,
    sql: string | undefined,
) {
    if (!error) return '';
    const trimmedSchema = schemaName?.trim();
    if (!trimmedSchema || !isMissingRelationError(error)) {
        return error;
    }

    const relationMatch = error.match(/relation\s+"([^"]+)"\s+does not exist/i);
    const relationName = relationMatch?.[1]?.trim();
    if (!relationName) return error;

    if (sql && hasQualifiedRelationReference(sql, relationName)) {
        return error;
    }

    if (error.includes(`Query ran against schema "${trimmedSchema}".`)) {
        return error;
    }

    return `${error} Query ran against schema "${trimmedSchema}". Switch the toolbar schema or qualify the table name.`;
}
