// SPDX-License-Identifier: GPL-3.0-only

export function resolvePreferredSchemaName(
    availableSchemas: string[],
    currentSchema: string,
): string {
    const normalizedCurrent = currentSchema.trim().toLowerCase();
    if (normalizedCurrent) {
        const matchedCurrent = availableSchemas.find(
            schemaName => schemaName.trim().toLowerCase() === normalizedCurrent,
        );
        if (matchedCurrent) return matchedCurrent;
    }

    const publicSchema = availableSchemas.find(
        schemaName => schemaName.trim().toLowerCase() === 'public',
    );
    if (publicSchema) return publicSchema;

    return availableSchemas[0] || '';
}
