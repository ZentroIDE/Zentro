// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Spinner } from '../ui';
import { cn } from '../../lib/cn';
import type { DeleteRelationshipsState } from '../../hooks/useDeleteRelationships';
import {
    worstSeverity,
    type ImpactSeverity,
    type IncomingRelationship,
    type RowImpact,
} from '../../lib/relationships/deleteImpact';

export type RelationshipWarningContext = 'rows' | 'drop' | 'truncate';

interface RelationshipWarningProps {
    state: DeleteRelationshipsState;
    context: RelationshipWarningContext;
    /** Postgres `CASCADE` on drop/truncate: dependents are taken along instead of blocking. */
    cascade?: boolean;
    /** Trailing control for a row, e.g. a button that opens the referencing rows. */
    renderItemAction?: (item: IncomingRelationship) => React.ReactNode;
    /** How many rows are being deleted; only the wording ("this record" / "these records") depends on it. */
    deletedCount?: number;
}

const MAX_VISIBLE = 8;

// The same tinted box as the write confirmation's risk banner, in the tone of
// what the referencing rows would do: cascading deletes data, the rest hold it up.
const SEVERITY_TONE: Record<ImpactSeverity, string> = {
    cascade: 'bg-destructive/8 text-destructive',
    blocking: 'bg-warning/10 text-warning',
    nullify: 'bg-info/10 text-info',
};

const SUBJECT: Record<RelationshipWarningContext, string> = {
    rows: 'these rows',
    drop: 'this table',
    truncate: 'this table',
};

const rowCountLabel = (impact: Extract<RowImpact, { status: 'referenced' }>) =>
    `${impact.count}${impact.hasMore ? '+' : ''} ${impact.count === 1 && !impact.hasMore ? 'row' : 'rows'}`;

interface Description {
    message: string;
    detail?: string;
}

function describe(
    incoming: IncomingRelationship[],
    context: Exclude<RelationshipWarningContext, 'rows'>,
    cascade: boolean,
): Description {
    const message = `Other tables reference ${SUBJECT[context]}.`;
    if (cascade) {
        return {
            message,
            detail: 'CASCADE will also remove the rows or constraints that depend on it.',
        };
    }
    switch (worstSeverity(incoming)) {
        case 'cascade':
            return { message, detail: 'Rows that depend on it will be deleted too.' };
        case 'nullify':
            return { message, detail: 'Their links to it will be cleared.' };
        default:
            return { message, detail: 'The database rejects this unless CASCADE is used.' };
    }
}

/**
 * The small print under a relationship in the drop/truncate lists: the ON DELETE
 * rule where it changes the outcome. A plain NO ACTION/RESTRICT is the ordinary
 * case and needs no saying.
 */
function detailParts(item: IncomingRelationship): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    if (item.severity !== 'blocking') parts.push(<span key='rule'>ON DELETE {item.onDelete}</span>);
    if (item.isSelfReference) parts.push(<span key='self'>same table</span>);
    return parts;
}

const Name: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <code className='font-mono'>{children}</code>
);

const tableLabel = (item: IncomingRelationship) =>
    item.sourceSchema ? `${item.sourceSchema}.${item.sourceTable}` : item.sourceTable;

/**
 * One relationship as a sentence: "1 row in public.order_details points to
 * this record through order_id." The ON DELETE rule is spelled out only where
 * it changes what the delete does; a plain NO ACTION is the ordinary case.
 */
const ReferenceSentence: React.FC<{ item: IncomingRelationship; deletedCount?: number }> = ({
    item,
    deletedCount,
}) => {
    const records = deletedCount === 1 ? 'this record' : 'these records';
    const through =
        item.columns.length > 0 ? (
            <>
                {' '}
                through <Name>{item.columns.join(', ')}</Name>
            </>
        ) : null;
    const impact = item.rowImpact;

    if (impact?.status === 'referenced') {
        const plural = impact.count !== 1 || impact.hasMore;
        return (
            <>
                {rowCountLabel(impact)} in <Name>{tableLabel(item)}</Name>{' '}
                {plural ? 'point' : 'points'} to {records}
                {through}.{item.severity === 'cascade' ? ' They will be deleted too.' : null}
                {item.severity === 'nullify' ? ' Their link will be cleared.' : null}
            </>
        );
    }
    if (impact?.status === 'unverified') {
        return (
            <span title={impact.reason ?? "Couldn't check the data"}>
                Couldn't check whether rows in <Name>{tableLabel(item)}</Name> point to {records}
                {through}.
            </span>
        );
    }
    return (
        <>
            Rows in <Name>{tableLabel(item)}</Name> may point to {records}
            {through}.
        </>
    );
};

const relationshipLabel = (item: IncomingRelationship) => {
    const table = item.sourceSchema ? `${item.sourceSchema}.${item.sourceTable}` : item.sourceTable;
    return item.columns.length > 0 ? `${table} (${item.columns.join(', ')})` : table;
};

/**
 * Shows which other tables hold foreign keys into the table being deleted from
 * or dropped. Renders nothing when there is nothing to warn about.
 */
export const RelationshipWarning: React.FC<RelationshipWarningProps> = ({
    state,
    context,
    cascade = false,
    renderItemAction,
    deletedCount,
}) => {
    if (state.status === 'loading') {
        return (
            <div
                className='flex items-center gap-1.5 text-label text-muted-foreground'
                role='status'
            >
                <Spinner size={12} aria-label='Checking relationships' />
                Checking relationships…
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <p className='text-label text-muted-foreground' role='status'>
                Couldn't check which tables reference this one.
            </p>
        );
    }

    const { incoming } = state;
    if (incoming.length === 0) return null;

    const visible = incoming.slice(0, MAX_VISIBLE);
    const hidden = incoming.length - visible.length;
    // Tone follows what was actually found when the data has been looked at.
    const referenced = incoming.filter(item => item.rowImpact?.status === 'referenced');
    const tone =
        SEVERITY_TONE[worstSeverity(referenced.length > 0 ? referenced : incoming) ?? 'blocking'];
    if (context === 'rows') {
        return (
            <div className={cn('rounded-md px-3 py-3', tone)} role='alert'>
                <ul className='flex flex-col gap-3'>
                    {visible.map(item => (
                        <li key={item.key} className='flex items-start justify-between gap-3'>
                            <p className='min-w-0 text-label leading-relaxed'>
                                <ReferenceSentence item={item} deletedCount={deletedCount} />
                            </p>
                            {renderItemAction ? (
                                <div className='shrink-0'>{renderItemAction(item)}</div>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {hidden > 0 ? <p className='text-label mt-2 opacity-70'>+{hidden} more</p> : null}
            </div>
        );
    }

    const description = describe(incoming, context, cascade);

    return (
        <div className={cn('rounded-md px-3 py-3', tone)} role='alert'>
            <p className='text-label'>{description.message}</p>
            {description.detail ? (
                <p className='text-label mt-1 opacity-70'>{description.detail}</p>
            ) : null}
            <ul className='mt-2 flex flex-col gap-2'>
                {visible.map(item => {
                    const parts = detailParts(item);
                    return (
                        <li key={item.key} className='flex items-center justify-between gap-3'>
                            <div className='min-w-0'>
                                <p
                                    className='truncate text-label font-medium'
                                    title={relationshipLabel(item)}
                                >
                                    {relationshipLabel(item)}
                                </p>
                                {parts.length > 0 ? (
                                    <p className='text-label opacity-70'>
                                        {parts.map((part, index) => (
                                            <React.Fragment key={index}>
                                                {index > 0 ? ' · ' : null}
                                                {part}
                                            </React.Fragment>
                                        ))}
                                    </p>
                                ) : null}
                            </div>
                            {renderItemAction ? (
                                <div className='shrink-0'>{renderItemAction(item)}</div>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {hidden > 0 ? <p className='text-label mt-2 opacity-70'>+{hidden} more</p> : null}
        </div>
    );
};
