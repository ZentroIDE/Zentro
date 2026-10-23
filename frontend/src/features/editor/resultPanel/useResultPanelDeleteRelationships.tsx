// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../../../components/ui';
import { RelationshipWarning } from '../../../components/shared/RelationshipWarning';
import {
    fetchIncomingRelationships,
    probeReferencingRows,
} from '../../../hooks/useDeleteRelationships';
import { toSqlLiteral } from '../../../lib/dataEditing';
import type { WriteGuardNotice } from '../../../lib/writeSafety/useWriteSafetyGuard';
import type { IncomingRelationship } from '../../../lib/relationships/deleteImpact';
import {
    buildReferencingProbe,
    planReferencingRowsQuery,
    type ReferencingRowsPlan,
} from '../../../lib/relationships/referencingRows';
import { useConnectionStore } from '../../../stores/connectionStore';
import type { TabResult } from '../../../stores/resultStore';
import type { models } from '../../../../wailsjs/go/models';
import type { PinnedResultConnection } from './types';

/**
 * What is needed to check, and to open, the rows that reference the deleted
 * ones. It comes through a ref, read only when a save starts, because the
 * pieces (blurred columns, the tab opener) are computed after this hook runs.
 */
export interface ReferencingViewContext {
    result: TabResult | undefined;
    deletedRows: ReadonlySet<number>;
    driver: string | undefined;
    columnDefsByName: Map<string, models.ColumnDef>;
    blurredColumnIndexes?: ReadonlySet<number>;
    openQueryTab: (query: string, title?: string) => void;
}

interface UseResultPanelDeleteRelationshipsOptions {
    deletedRowCount: number;
    tableRef: { schema: string; table: string };
    /** Table to check when it could not be parsed from the query. */
    fallbackTableName?: string;
    viewMode: boolean;
    pinnedConnection?: PinnedResultConnection;
    viewContextRef?: React.MutableRefObject<ReferencingViewContext | null>;
}

/** The rows being deleted as the database still holds them: original values, not pending edits. */
function originalDeletedRows(view: ReferencingViewContext, result: TabResult) {
    const windowStart = result.windowStartOffset ?? 0;
    return Array.from(view.deletedRows)
        .sort((a, b) => a - b)
        .map(rowIndex => result.rows[rowIndex - windowStart]);
}

const literalFor = (view: ReferencingViewContext) => (column: string, value: string) =>
    toSqlLiteral(value, view.columnDefsByName.get(column), view.driver);

/**
 * Narrows the foreign keys that point at the table down to the ones whose rows
 * really reference what is being deleted. A constraint in the schema is not a
 * problem for a key nothing points at; only referenced data makes the delete
 * fail, so only that is worth interrupting the user for.
 *
 * Errs toward warning: anything that could not be checked is kept, marked
 * `unverified`, rather than assumed safe.
 */
async function keepReferencedRelationships(
    incoming: IncomingRelationship[],
    view: ReferencingViewContext | null | undefined,
    connection: { connectionID: string; dbName: string },
): Promise<IncomingRelationship[]> {
    const result = view?.result;
    if (!view || !result) {
        return incoming.map(rel => ({
            ...rel,
            rowImpact: { status: 'unverified', reason: 'The deleted rows are not available.' },
        }));
    }

    const deletedRows = originalDeletedRows(view, result);
    const planned = incoming.map(relationship => ({
        relationship,
        plan: buildReferencingProbe({
            relationship,
            resultColumns: result.columns,
            deletedRows,
            literal: literalFor(view),
        }),
    }));

    const probes = planned.flatMap(({ plan }) =>
        plan.ok && plan.probe.Keys.length > 0 ? [plan.probe] : [],
    );
    const answers = new Map<
        string,
        { verified: boolean; count: number; hasMore: boolean; error?: string }
    >();
    if (probes.length > 0) {
        try {
            const results = await probeReferencingRows(
                connection.connectionID,
                connection.dbName,
                probes,
            );
            for (const answer of results) {
                answers.set(answer.Key, {
                    verified: answer.Verified,
                    count: answer.Count,
                    hasMore: answer.HasMore,
                    error: answer.Error,
                });
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            for (const probe of probes) {
                answers.set(probe.Key, {
                    verified: false,
                    count: 0,
                    hasMore: false,
                    error: reason,
                });
            }
        }
    }

    return planned.flatMap(({ relationship, plan }): IncomingRelationship[] => {
        if (!plan.ok) {
            return [{ ...relationship, rowImpact: { status: 'unverified', reason: plan.reason } }];
        }
        // None of the deleted rows has a key a row could point at.
        if (plan.probe.Keys.length === 0) return [];

        const answer = answers.get(relationship.key);
        if (!answer || !answer.verified) {
            return [
                {
                    ...relationship,
                    rowImpact: { status: 'unverified', reason: answer?.error || undefined },
                },
            ];
        }
        if (answer.count === 0) return [];
        return [
            {
                ...relationship,
                rowImpact: { status: 'referenced', count: answer.count, hasMore: answer.hasMore },
            },
        ];
    });
}

function planReferencingViews(
    incoming: IncomingRelationship[],
    view: ReferencingViewContext | null | undefined,
): Record<string, ReferencingRowsPlan> {
    const result = view?.result;
    if (!view || !result) return {};
    const deletedRows = originalDeletedRows(view, result);
    const plans: Record<string, ReferencingRowsPlan> = {};
    for (const relationship of incoming) {
        plans[relationship.key] = planReferencingRowsQuery({
            relationship,
            driver: view.driver,
            resultColumns: result.columns,
            deletedRows,
            blurredColumnIndexes: view.blurredColumnIndexes,
            literal: literalFor(view),
        });
    }
    return plans;
}

/**
 * Before pending row deletes are saved, checks whether rows in other tables
 * actually reference the rows being deleted. Returns a notice for the write
 * confirmation to show, or `null` when nothing does: a foreign key whose child
 * rows do not point at the deleted keys is no obstacle, and the delete then
 * goes straight through without a word.
 *
 * The notice rides in the write-safety confirm dialog instead of a dialog of
 * its own, so one save is one confirmation. A delete is always confirmed there,
 * whatever the safety level, so the notice never has to ask by itself.
 *
 * Never blocks on failing to read the schema: the save proceeds and the
 * database still enforces its constraints. A failure to read the data is the
 * opposite case: the relationships are then shown as not checked, because
 * silence there would look like "safe".
 */
export function useResultPanelDeleteRelationships({
    deletedRowCount,
    tableRef,
    fallbackTableName,
    viewMode,
    pinnedConnection,
    viewContextRef,
}: UseResultPanelDeleteRelationshipsOptions) {
    const activeConnectionID = useConnectionStore(s => s.activeProfile?.id ?? '');
    const activeDbName = useConnectionStore(s => s.activeProfile?.db_name ?? '');

    const tableName = tableRef.table || fallbackTableName || '';
    // A pinned Table tab saves against its own environment (ADR-0001), so its
    // relationships have to be read from there, not from the ambient connection.
    const connectionID = pinnedConnection?.connectionID ?? activeConnectionID;
    const dbName = pinnedConnection?.dbName ?? activeDbName;

    const resolveDeleteNotice = React.useCallback(async (): Promise<WriteGuardNotice | null> => {
        if (viewMode || deletedRowCount === 0 || !connectionID || !tableName) return null;

        let incoming: IncomingRelationship[];
        try {
            incoming = await fetchIncomingRelationships(
                { connectionID, dbName, schema: tableRef.schema, table: tableName },
                { includeSelfReferences: true },
            );
        } catch {
            return null;
        }
        if (incoming.length === 0) return null;

        // Foreign keys in the schema are not the question; rows that reference
        // what is being deleted are. With none of those the delete just works.
        const view = viewContextRef?.current;
        const referenced = await keepReferencedRelationships(incoming, view, {
            connectionID,
            dbName,
        });
        if (referenced.length === 0) return null;

        const plans = planReferencingViews(referenced, view);
        const openQueryTab = view?.openQueryTab;

        return {
            content: ({ dismiss }) => (
                <RelationshipWarning
                    state={{ status: 'ready', incoming: referenced }}
                    context='rows'
                    deletedCount={deletedRowCount}
                    renderItemAction={item => {
                        const plan = plans[item.key];
                        if (!plan || !openQueryTab) return null;
                        // Looking at the referencing rows means leaving this decision
                        // for later: the dialog closes as a cancel, the deletes stay staged.
                        return (
                            <Button
                                variant='ghost'
                                size='sm'
                                disabled={!plan.ok}
                                title={
                                    plan.ok
                                        ? 'Open the rows that reference these in a query tab. Your pending deletes stay unsaved.'
                                        : plan.reason
                                }
                                onClick={() => {
                                    if (!plan.ok) return;
                                    openQueryTab(plan.sql, `${item.sourceTable} rows`);
                                    dismiss();
                                }}
                            >
                                View rows
                            </Button>
                        );
                    }}
                />
            ),
        };
    }, [
        connectionID,
        dbName,
        deletedRowCount,
        tableName,
        tableRef.schema,
        viewContextRef,
        viewMode,
    ]);

    return { resolveDeleteNotice } as const;
}
