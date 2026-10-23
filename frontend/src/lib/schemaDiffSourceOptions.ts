// SPDX-License-Identifier: GPL-3.0-only

import type { ConnectionProfile } from '../types/connection';
import type { EnvironmentKey, Project } from '../types/project';
import type { SchemaDiffSource } from '../types/schemaDiff';

export interface SchemaDiffEnvironmentChoice {
    environmentKey: EnvironmentKey;
    environmentLabel: string;
    profileName: string;
    databaseName: string;
    schemaName: string;
}

export const SCHEMA_DIFF_FALLBACK_SCHEMA = 'public';

export function buildSchemaDiffEnvironmentChoices(
    project: Project | null | undefined,
    loadedConnections: ConnectionProfile[],
): SchemaDiffEnvironmentChoice[] {
    const environments = project?.environments || [];

    return environments
        .map(environment => {
            const connectionRef = (environment.connection_ref || '').trim();
            if (!connectionRef) return null;

            // connection_ref is a pool connection ID — resolve to the
            // display name (backend resolves either, but the UI shows this).
            const profileName =
                loadedConnections.find(c => c.id === connectionRef)?.name || connectionRef;

            return {
                environmentKey: environment.key,
                environmentLabel: environment.label,
                profileName,
                databaseName: environment.last_database || '',
                schemaName: environment.last_schema || SCHEMA_DIFF_FALLBACK_SCHEMA,
            };
        })
        .filter((item): item is SchemaDiffEnvironmentChoice => Boolean(item));
}

export function buildSchemaDiffSource(
    choice: SchemaDiffEnvironmentChoice,
    schemaName: string,
): SchemaDiffSource {
    const nextSchemaName = schemaName.trim() || choice.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA;
    return {
        environmentKey: choice.environmentKey,
        profileName: choice.profileName,
        databaseName: choice.databaseName,
        schemaName: nextSchemaName,
        label: `${choice.environmentLabel} / ${choice.profileName} / ${nextSchemaName}`,
    };
}
