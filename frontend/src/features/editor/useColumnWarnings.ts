// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from 'react';
import {
    findUnknownColumns,
    type ColumnTableRef,
    type SqlColumnWarning,
} from '../../lib/monaco/sqlColumnValidation';
import { useSchemaStore, type SchemaNode } from '../../stores/schemaStore';

// Long enough that a pause between words does not re-check every keystroke;
// short enough that a finished typo is flagged before the user moves on.
const COLUMN_VALIDATION_DEBOUNCE_MS = 500;

interface UseColumnWarningsParams {
    enabled: boolean;
    sqlText: string;
    schemas: SchemaNode[];
    currentSchema: string;
    profileName: string;
    dbName: string;
    driver: string;
}

/**
 * Unknown-column warnings for the editor text, recomputed after typing pauses.
 * `refreshColumns` re-reads the given tables from the database (the cached
 * columns may predate a schema change) and then re-runs the check.
 */
export function useColumnWarnings({
    enabled,
    sqlText,
    schemas,
    currentSchema,
    profileName,
    dbName,
    driver,
}: UseColumnWarningsParams): {
    warnings: SqlColumnWarning[];
    refreshColumns: (tables: ColumnTableRef[]) => Promise<void>;
} {
    const [warnings, setWarnings] = useState<SqlColumnWarning[]>([]);
    const [refreshCount, setRefreshCount] = useState(0);
    const refreshColumns = useCallback(
        async (tables: ColumnTableRef[]) => {
            const store = useSchemaStore.getState();
            try {
                await Promise.all(
                    tables.map(table =>
                        store.checkAndFetchColumns(
                            profileName,
                            dbName,
                            table.schemaName,
                            table.name,
                            {
                                force: true,
                            },
                        ),
                    ),
                );
            } catch (error) {
                console.error('refresh table columns failed', error);
            }
            setRefreshCount(count => count + 1);
        },
        [profileName, dbName],
    );

    useEffect(() => {
        const canValidate =
            enabled && profileName && dbName && schemas.length > 0 && sqlText.trim() !== '';
        if (!canValidate) {
            setWarnings(previous => (previous.length > 0 ? [] : previous));
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            findUnknownColumns(
                sqlText,
                {
                    schemas,
                    currentSchema,
                    driver,
                    fetchColumns: (schemaName, tableName) =>
                        useSchemaStore
                            .getState()
                            .checkAndFetchColumns(profileName, dbName, schemaName, tableName),
                },
                () => cancelled,
            )
                .then(result => {
                    if (!cancelled) setWarnings(result);
                })
                .catch(() => {
                    if (!cancelled) setWarnings([]);
                });
        }, COLUMN_VALIDATION_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [enabled, sqlText, schemas, currentSchema, profileName, dbName, driver, refreshCount]);

    return { warnings, refreshColumns };
}
