// SPDX-License-Identifier: GPL-3.0-only

import { onSchemaDatabases, onSchemaError, onSchemaLoaded } from '../../../lib/events';
import { useSchemaStore } from '../../../stores/schemaStore';
import { appLogger } from '../../../lib/logger';
import { notifyImportantError, type EventBridgeToast, type Unsubscribe } from './shared';

export interface SchemaEventDeps {
    toast: EventBridgeToast;
    setDatabases: (databases: string[]) => void;
}

// Schema tree loading events.
export function subscribeSchemaEvents(deps: SchemaEventDeps): Unsubscribe[] {
    const { toast, setDatabases } = deps;

    return [
        onSchemaDatabases(data => {
            appLogger.info('schema databases', data);
            setDatabases(data.databases ?? []);
        }),
        onSchemaError(data => {
            appLogger.warn('schema error', data);
            useSchemaStore.getState().setLoading(data.profileName, data.dbName, false);
            notifyImportantError(
                toast.error,
                `Failed to load schema for ${data.dbName}: ${data.error}`,
                {
                    important: true,
                    source: 'system.schema',
                    dedupeKey: `schema-error:${data.profileName}:${data.dbName}`,
                },
            );
        }),
        onSchemaLoaded(data => {
            useSchemaStore.getState().setTree(data.profileName, data.dbName, data.schemas);
        }),
    ];
}
