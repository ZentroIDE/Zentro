// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { models } from '../../../../wailsjs/go/models';
import { fail, ok } from '../../../shared/kernel';
import type { TabResult } from '../../../stores/resultStore';
import type { WriteGuardNotice } from '../../../lib/writeSafety/useWriteSafetyGuard';
import type { PinnedResultConnection } from './types';

const mocks = vi.hoisted(() => ({
    fetchTableRelationships: vi.fn(),
    countReferencingRows: vi.fn(),
}));

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        schema: {
            fetchTableRelationships: mocks.fetchTableRelationships,
            countReferencingRows: mocks.countReferencingRows,
        },
    }),
}));

vi.mock('../../../stores/connectionStore', () => ({
    useConnectionStore: (
        selector: (state: { activeProfile: { id: string; db_name: string } }) => unknown,
    ) => selector({ activeProfile: { id: 'active-conn', db_name: 'active_db' } }),
}));

import {
    useResultPanelDeleteRelationships,
    type ReferencingViewContext,
} from './useResultPanelDeleteRelationships';

function rel(overrides: Partial<models.TableRelationship> = {}) {
    return models.TableRelationship.createFrom({
        ConstraintName: 'fk_orders_user',
        SourceSchema: 'public',
        SourceTable: 'orders',
        SourceColumn: 'user_id',
        TargetSchema: 'public',
        TargetTable: 'users',
        TargetColumn: 'id',
        OnDelete: 'NO ACTION',
        OnUpdate: 'NO ACTION',
        ...overrides,
    });
}

type Probe = { Key: string; Schema: string; Table: string; Columns: string[]; Keys: string[][] };

/** Answers every probe the same way, as the database would for that many child rows. */
const answerWith =
    (count: number, extra: Record<string, unknown> = {}) =>
    async (_connectionID: string, _dbName: string, probes: Probe[]) =>
        ok(
            probes.map(probe => ({
                Key: probe.Key,
                Count: count,
                HasMore: false,
                Verified: true,
                ...extra,
            })),
        );

const idColumn = models.ColumnDef.createFrom({
    Name: 'id',
    DataType: 'integer',
    IsPrimaryKey: true,
    IsNullable: false,
});

const makeView = (overrides: Partial<ReferencingViewContext> = {}): ReferencingViewContext => ({
    result: {
        columns: ['id', 'name'],
        rows: [
            ['7', 'a'],
            ['8', 'b'],
            ['9', 'c'],
        ],
        windowStartOffset: 0,
    } as TabResult,
    deletedRows: new Set([0, 2]),
    driver: 'postgres',
    columnDefsByName: new Map([['id', idColumn]]),
    openQueryTab: vi.fn(),
    ...overrides,
});

interface HarnessProps {
    deletedRowCount?: number;
    viewMode?: boolean;
    pinnedConnection?: PinnedResultConnection;
    view?: ReferencingViewContext;
    onNotice: (notice: WriteGuardNotice | null) => void;
}

function Harness({
    deletedRowCount = 2,
    viewMode = false,
    pinnedConnection,
    view,
    onNotice,
}: HarnessProps) {
    const viewContextRef = React.useRef<ReferencingViewContext | null>(view ?? null);
    const { resolveDeleteNotice } = useResultPanelDeleteRelationships({
        deletedRowCount,
        tableRef: { schema: 'public', table: 'users' },
        viewMode,
        pinnedConnection,
        viewContextRef,
    });
    return <button onClick={() => void resolveDeleteNotice().then(onNotice)}>check</button>;
}

/** Runs the check and returns what it resolved to. */
async function check(props: Partial<HarnessProps> = {}) {
    let resolved: WriteGuardNotice | null | undefined;
    render(<Harness view={makeView()} onNotice={notice => (resolved = notice)} {...props} />);
    await act(async () => {
        fireEvent.click(screen.getByText('check'));
    });
    await waitFor(() => expect(resolved).not.toBeUndefined());
    return resolved as WriteGuardNotice | null;
}

/** Shows the notice the way the confirm dialog would. */
function showNotice(notice: WriteGuardNotice, dismiss = vi.fn()) {
    render(<div data-testid='notice'>{notice.content({ dismiss })}</div>);
    return { dismiss };
}

describe('useResultPanelDeleteRelationships', () => {
    beforeEach(() => {
        mocks.fetchTableRelationships.mockReset();
        mocks.countReferencingRows.mockReset().mockImplementation(answerWith(2));
    });

    describe('when there is nothing to warn about', () => {
        it('has no notice when no table references this one', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([]));

            expect(await check()).toBeNull();
        });

        it('does not look anything up when no rows are being deleted', async () => {
            expect(await check({ deletedRowCount: 0 })).toBeNull();
            expect(mocks.fetchTableRelationships).not.toHaveBeenCalled();
        });

        it('does not look anything up in view mode', async () => {
            expect(await check({ viewMode: true })).toBeNull();
            expect(mocks.fetchTableRelationships).not.toHaveBeenCalled();
        });

        it('has no notice, and does not get in the way, when the schema cannot be read', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(fail({ code: 'x', message: 'boom' }));

            expect(await check()).toBeNull();
        });

        it('has no notice when no child row references the deleted keys', async () => {
            // The foreign key exists in the schema, but nothing points at these rows.
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(0));

            expect(await check()).toBeNull();
        });

        it('does not query the database for a key that cannot be referenced (NULL)', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            const nullable = models.ColumnDef.createFrom({
                Name: 'id',
                DataType: 'integer',
                IsPrimaryKey: false,
                IsNullable: true,
            });

            const notice = await check({
                view: makeView({
                    result: {
                        columns: ['id', 'name'],
                        rows: [['', 'a']],
                        windowStartOffset: 0,
                    } as TabResult,
                    deletedRows: new Set([0]),
                    columnDefsByName: new Map([['id', nullable]]),
                }),
            });

            expect(notice).toBeNull();
            expect(mocks.countReferencingRows).not.toHaveBeenCalled();
        });
    });

    describe('when child rows reference the deleted ones', () => {
        it('gives a notice for the write confirmation to show', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));

            const notice = await check();

            expect(notice).not.toBeNull();
        });

        it('lists the referencing table and column with the number of rows', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(14));

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent(
                '14 rows in public.orders point to these records through user_id.',
            );
        });

        it('says so when the count was cut off', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(1000, { HasMore: true }));

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent('1000+ rows in public.orders');
        });

        it('lists only the relationships that are really referenced', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(
                ok([
                    rel({ SourceTable: 'order_details', ConstraintName: 'fk_od' }),
                    rel({ SourceTable: 'shipments', ConstraintName: 'fk_ship' }),
                ]),
            );
            mocks.countReferencingRows.mockImplementation(
                async (_c: string, _d: string, probes: Probe[]) =>
                    ok(
                        probes.map(probe => ({
                            Key: probe.Key,
                            Count: probe.Table === 'order_details' ? 3 : 0,
                            HasMore: false,
                            Verified: true,
                        })),
                    ),
            );

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent('public.order_details');
            expect(screen.getByRole('alert')).not.toHaveTextContent('public.shipments');
        });

        it('counts a self-referencing key, since parent rows can still have children', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(
                ok([
                    rel({
                        ConstraintName: 'fk_users_parent',
                        SourceTable: 'users',
                        SourceColumn: 'parent_id',
                    }),
                ]),
            );

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent('in public.users');
        });
    });

    describe('which database it asks', () => {
        it('reads and probes the active connection', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(0));

            await check();

            expect(mocks.fetchTableRelationships).toHaveBeenCalledWith(
                'active-conn',
                'active_db',
                'public',
                'users',
            );
            expect(mocks.countReferencingRows).toHaveBeenCalledWith(
                'active-conn',
                'active_db',
                expect.any(Array),
            );
        });

        it('reads and probes the pinned environment for a pinned tab', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(0));

            await check({
                pinnedConnection: {
                    connectionID: 'pinned-conn',
                    dbName: 'pinned_db',
                    driver: 'postgres',
                    environmentKey: 'staging',
                },
            });

            expect(mocks.fetchTableRelationships).toHaveBeenCalledWith(
                'pinned-conn',
                'pinned_db',
                'public',
                'users',
            );
            expect(mocks.countReferencingRows).toHaveBeenCalledWith(
                'pinned-conn',
                'pinned_db',
                expect.any(Array),
            );
        });

        it('sends the original key values of the deleted rows, not pending edits', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(answerWith(0));

            await check();

            const probes = mocks.countReferencingRows.mock.calls[0][2];
            expect(probes).toHaveLength(1);
            expect(probes[0]).toMatchObject({
                Schema: 'public',
                Table: 'orders',
                Columns: ['user_id'],
                Keys: [['7'], ['9']],
            });
        });
    });

    describe('what it does with what it could not check', () => {
        it('keeps a relationship the database could not answer, marked as not checked', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockImplementation(
                answerWith(0, { Verified: false, Error: 'too many keys to check' }),
            );

            const notice = await check();
            showNotice(notice!);

            expect(notice).not.toBeNull();
            expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check whether rows in");
        });

        it('keeps the relationships, marked as not checked, when the data check itself fails', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            mocks.countReferencingRows.mockResolvedValue(fail({ code: 'x', message: 'boom' }));

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check whether rows in");
        });

        it('keeps a relationship whose referenced column is not in the result, as not checked', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(
                ok([rel({ TargetColumn: 'external_ref' })]),
            );

            showNotice((await check())!);

            expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check whether rows in");
            expect(mocks.countReferencingRows).not.toHaveBeenCalled();
        });

        it('keeps the relationships as not checked when the panel gave no rows to read keys from', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));

            showNotice((await check({ view: undefined }))!);

            expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check whether rows in");
            expect(mocks.countReferencingRows).not.toHaveBeenCalled();
        });
    });

    describe('viewing the referencing rows', () => {
        it('opens the child rows for the deleted keys and dismisses the confirmation', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            const view = makeView();
            const { dismiss } = showNotice((await check({ view }))!);

            fireEvent.click(screen.getByRole('button', { name: 'View rows' }));

            expect(view.openQueryTab).toHaveBeenCalledWith(
                'SELECT * FROM "public"."orders" WHERE "user_id" IN (7, 9);',
                'orders rows',
            );
            expect(dismiss).toHaveBeenCalledTimes(1);
        });

        it('uses the original value of an edited key, not the pending edit', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            const view = makeView({ deletedRows: new Set([1]) });
            showNotice((await check({ view }))!);

            fireEvent.click(screen.getByRole('button', { name: 'View rows' }));

            expect(view.openQueryTab).toHaveBeenCalledWith(
                'SELECT * FROM "public"."orders" WHERE "user_id" IN (8);',
                'orders rows',
            );
        });

        it('disables the button, with the reason, when the referenced column is blurred', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            showNotice((await check({ view: makeView({ blurredColumnIndexes: new Set([0]) }) }))!);

            const button = screen.getByRole('button', { name: 'View rows' });

            expect(button).toBeDisabled();
            expect(button).toHaveAttribute('title', expect.stringContaining('blurred'));
        });

        it('offers no button when the panel gave no way to open a tab', async () => {
            mocks.fetchTableRelationships.mockResolvedValue(ok([rel()]));
            showNotice((await check({ view: undefined }))!);

            expect(screen.queryByRole('button', { name: 'View rows' })).not.toBeInTheDocument();
        });
    });
});
