// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import type { models } from '../../wailsjs/go/models';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import {
    summarizeIncomingRelationships,
    type IncomingRelationship,
} from '../lib/relationships/deleteImpact';

export interface DeleteRelationshipsTarget {
    connectionID: string;
    dbName: string;
    schema: string;
    table: string;
}

export interface FetchIncomingOptions {
    includeSelfReferences?: boolean;
}

/**
 * Foreign keys in other tables that reference `target`.
 *
 * Goes to the gateway directly instead of through schemaStore's cached
 * `checkAndFetchRelationships`: that one swallows errors into an empty list
 * (indistinguishable from "no relationships") and serves results for up to
 * five minutes, and a delete warning must not miss a key added since.
 */
export async function fetchIncomingRelationships(
    { connectionID, dbName, schema, table }: DeleteRelationshipsTarget,
    options: FetchIncomingOptions = {},
): Promise<IncomingRelationship[]> {
    const relationships = unwrapOrThrow(
        await getApiGateway().schema.fetchTableRelationships(connectionID, dbName, schema, table),
    );
    return summarizeIncomingRelationships(relationships, { schema, table }, options);
}

/**
 * Asks the database whether rows of each child table still reference the keys
 * being deleted: a look at the data, where `fetchIncomingRelationships` only
 * reads the schema. Rejects when the call itself fails.
 */
export async function probeReferencingRows(
    connectionID: string,
    dbName: string,
    probes: models.ReferencingRowsProbe[],
): Promise<models.ReferencingRowsResult[]> {
    return unwrapOrThrow(
        await getApiGateway().schema.countReferencingRows(connectionID, dbName, probes),
    );
}

export type DeleteRelationshipsState =
    | { status: 'idle'; incoming: IncomingRelationship[] }
    | { status: 'loading'; incoming: IncomingRelationship[] }
    | { status: 'ready'; incoming: IncomingRelationship[] }
    | { status: 'error'; incoming: IncomingRelationship[] };

const IDLE: DeleteRelationshipsState = { status: 'idle', incoming: [] };

/**
 * Loads the referencing foreign keys for a dialog while it is open. Pass
 * `null` while there is nothing to check (dialog closed, not a table).
 */
export function useDeleteRelationships(
    target: DeleteRelationshipsTarget | null,
    options: FetchIncomingOptions = {},
): DeleteRelationshipsState {
    const [state, setState] = useState<DeleteRelationshipsState>(IDLE);
    const { connectionID, dbName, schema, table } = target ?? {
        connectionID: '',
        dbName: '',
        schema: '',
        table: '',
    };
    const active = target !== null && Boolean(connectionID) && Boolean(table);
    const includeSelfReferences = options.includeSelfReferences ?? false;

    useEffect(() => {
        if (!active) {
            setState(IDLE);
            return;
        }
        let cancelled = false;
        setState({ status: 'loading', incoming: [] });
        fetchIncomingRelationships(
            { connectionID, dbName, schema, table },
            { includeSelfReferences },
        )
            .then(incoming => {
                if (!cancelled) setState({ status: 'ready', incoming });
            })
            .catch(() => {
                if (!cancelled) setState({ status: 'error', incoming: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [active, connectionID, dbName, schema, table, includeSelfReferences]);

    return state;
}
