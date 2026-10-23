// SPDX-License-Identifier: GPL-3.0-only

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeleteRelationshipsState } from '../../hooks/useDeleteRelationships';
import type { IncomingRelationship } from '../../lib/relationships/deleteImpact';
import { RelationshipWarning } from './RelationshipWarning';

function incoming(overrides: Partial<IncomingRelationship> = {}): IncomingRelationship {
    return {
        key: 'public.orders.fk_orders_user',
        sourceSchema: 'public',
        sourceTable: 'orders',
        constraintName: 'fk_orders_user',
        columns: ['user_id'],
        columnPairs: [{ source: 'user_id', target: 'id' }],
        hasUnambiguousColumnMapping: true,
        onDelete: 'NO ACTION',
        severity: 'blocking',
        isSelfReference: false,
        ...overrides,
    };
}

const ready = (items: IncomingRelationship[]): DeleteRelationshipsState => ({
    status: 'ready',
    incoming: items,
});

const referenced = (
    count: number,
    hasMore = false,
    overrides: Partial<IncomingRelationship> = {},
) => incoming({ rowImpact: { status: 'referenced', count, hasMore }, ...overrides });

describe('RelationshipWarning', () => {
    it('renders nothing when no table references the target', () => {
        const { container } = render(<RelationshipWarning state={ready([])} context='rows' />);

        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing while idle', () => {
        const { container } = render(
            <RelationshipWarning state={{ status: 'idle', incoming: [] }} context='drop' />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('shows a progress note while loading', () => {
        render(<RelationshipWarning state={{ status: 'loading', incoming: [] }} context='drop' />);

        expect(screen.getByText('Checking relationships…')).toBeInTheDocument();
    });

    it('says so when the lookup failed instead of claiming there are none', () => {
        render(<RelationshipWarning state={{ status: 'error', incoming: [] }} context='drop' />);

        expect(screen.getByText(/Couldn't check which tables reference/)).toBeInTheDocument();
    });

    describe('for rows being deleted, once the data has been checked', () => {
        const alert = () => screen.getByRole('alert');

        it('says how many rows in which table point to the record, and through what, and nothing else', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        referenced(1, false, {
                            sourceTable: 'order_details',
                            columns: ['order_id'],
                        }),
                    ])}
                    context='rows'
                    deletedCount={1}
                />,
            );

            expect(alert()).not.toHaveTextContent('Still referenced');
            expect(alert()).toHaveTextContent(
                '1 row in public.order_details points to this record through order_id.',
            );
        });

        it('sets the table and column apart as code', () => {
            render(<RelationshipWarning state={ready([referenced(2)])} context='rows' />);

            const names = Array.from(alert().querySelectorAll('code')).map(el => el.textContent);
            expect(names).toEqual(['public.orders', 'user_id']);
        });

        it('says "rows" and "point" for several, and "these records" for several deleted', () => {
            render(
                <RelationshipWarning
                    state={ready([referenced(14)])}
                    context='rows'
                    deletedCount={3}
                />,
            );

            expect(alert()).toHaveTextContent(
                '14 rows in public.orders point to these records through user_id.',
            );
        });

        it('marks a count that was cut off', () => {
            render(<RelationshipWarning state={ready([referenced(1000, true)])} context='rows' />);

            expect(alert()).toHaveTextContent('1000+ rows in public.orders point to');
        });

        it('names every column of a composite key', () => {
            render(
                <RelationshipWarning
                    state={ready([referenced(2, false, { columns: ['tenant_id', 'user_id'] })])}
                    context='rows'
                />,
            );

            expect(alert()).toHaveTextContent('through tenant_id, user_id.');
        });

        it('adds no tag, no rule and no explanation for a plain blocking key', () => {
            render(<RelationshipWarning state={ready([referenced(2)])} context='rows' />);

            expect(alert()).not.toHaveTextContent(/ON DELETE/);
            expect(alert()).not.toHaveTextContent(/Blocks|The database rejects/);
        });

        it('says the rows will be deleted too when the key cascades', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        referenced(2, false, { onDelete: 'CASCADE', severity: 'cascade' }),
                    ])}
                    context='rows'
                />,
            );

            expect(alert()).toHaveTextContent('They will be deleted too.');
        });

        it('says the link will be cleared when the key sets null', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        referenced(2, false, { onDelete: 'SET NULL', severity: 'nullify' }),
                    ])}
                    context='rows'
                />,
            );

            expect(alert()).toHaveTextContent('Their link will be cleared.');
        });

        it('says it could not check, with the reason on hover, for a relationship it could not verify', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        incoming({
                            rowImpact: { status: 'unverified', reason: 'too many keys to check' },
                        }),
                    ])}
                    context='rows'
                    deletedCount={2}
                />,
            );

            expect(alert()).toHaveTextContent(
                "Couldn't check whether rows in public.orders point to these records through user_id.",
            );
            expect(screen.getByTitle('too many keys to check')).toBeInTheDocument();
        });

        it('lists each relationship on its own, with its action on the right', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        referenced(1, false, { key: 'a', sourceTable: 'order_details' }),
                        referenced(3, false, { key: 'b', sourceTable: 'shipments' }),
                    ])}
                    context='rows'
                    renderItemAction={item => <span>action for {item.sourceTable}</span>}
                />,
            );

            expect(screen.getAllByRole('listitem')).toHaveLength(2);
            expect(screen.getByText('action for order_details')).toBeInTheDocument();
            expect(screen.getByText('action for shipments')).toBeInTheDocument();
        });

        it('caps the list and reports how many are hidden', () => {
            const many = Array.from({ length: 11 }, (_, index) =>
                referenced(1, false, { key: `k${index}`, sourceTable: `child_${index}` }),
            );
            render(<RelationshipWarning state={ready(many)} context='rows' />);

            expect(screen.getAllByRole('listitem')).toHaveLength(8);
            expect(screen.getByText('+3 more')).toBeInTheDocument();
        });
    });

    it('for rows nobody has checked, only says they may point to the record', () => {
        render(<RelationshipWarning state={ready([incoming()])} context='rows' />);

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Rows in public.orders may point to these records through user_id.',
        );
    });

    describe('for a table being dropped or truncated', () => {
        it('lists the referencing table and its columns', () => {
            render(<RelationshipWarning state={ready([incoming()])} context='drop' />);

            expect(screen.getByText('public.orders (user_id)')).toBeInTheDocument();
        });

        it('explains that CASCADE takes the dependents along', () => {
            render(<RelationshipWarning state={ready([incoming()])} context='drop' cascade />);

            expect(screen.getByText(/CASCADE will also remove/)).toBeInTheDocument();
        });

        it('explains that a plain drop is rejected without CASCADE', () => {
            render(<RelationshipWarning state={ready([incoming()])} context='drop' />);

            expect(screen.getByText(/rejects this unless CASCADE is used/)).toBeInTheDocument();
        });

        it('leaves out the ordinary NO ACTION rule and any tag', () => {
            render(<RelationshipWarning state={ready([incoming()])} context='drop' />);

            expect(screen.queryByText(/ON DELETE/)).not.toBeInTheDocument();
            expect(screen.queryByText('Blocks')).not.toBeInTheDocument();
        });

        it('spells out the ON DELETE rule where it changes the outcome', () => {
            render(
                <RelationshipWarning
                    state={ready([incoming({ onDelete: 'SET NULL', severity: 'nullify' })])}
                    context='drop'
                />,
            );

            expect(screen.getByText('ON DELETE SET NULL')).toBeInTheDocument();
        });

        it('marks a self-referencing key', () => {
            render(
                <RelationshipWarning
                    state={ready([incoming({ isSelfReference: true, sourceTable: 'users' })])}
                    context='drop'
                />,
            );

            expect(screen.getByText('same table')).toBeInTheDocument();
        });

        it('renders a per-row action next to each relationship', () => {
            render(
                <RelationshipWarning
                    state={ready([
                        incoming(),
                        incoming({ key: 'public.invoices.fk_inv', sourceTable: 'invoices' }),
                    ])}
                    context='drop'
                    renderItemAction={item => <span>action for {item.sourceTable}</span>}
                />,
            );

            expect(screen.getByText('action for orders')).toBeInTheDocument();
            expect(screen.getByText('action for invoices')).toBeInTheDocument();
        });
    });
});
