// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeleteRelationshipsState } from '../../../hooks/useDeleteRelationships';
import { ConfirmMaintenanceDialogs } from './ConfirmMaintenanceDialogs';

const referencedBy: DeleteRelationshipsState = {
    status: 'ready',
    incoming: [
        {
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
        },
    ],
};

function renderDialogs(overrides: Partial<React.ComponentProps<typeof ConfirmMaintenanceDialogs>>) {
    const props = {
        dropModal: null,
        truncateModal: null,
        onCloseDrop: vi.fn(),
        onCloseTruncate: vi.fn(),
        onConfirmDrop: vi.fn(),
        onConfirmTruncate: vi.fn(),
        ...overrides,
    };
    render(<ConfirmMaintenanceDialogs {...props} />);
    return props;
}

describe('ConfirmMaintenanceDialogs relationship warning', () => {
    it('lists the tables that reference the table being dropped', () => {
        renderDialogs({
            dropModal: { schema: 'public', item: 'users', type: 'TABLE', cascade: false },
            dropRelationships: referencedBy,
        });

        expect(screen.getByText('public.orders (user_id)')).toBeInTheDocument();
        expect(screen.getByText(/rejects this unless CASCADE is used/)).toBeInTheDocument();
    });

    it('notes that CASCADE takes dependents along', () => {
        renderDialogs({
            dropModal: { schema: 'public', item: 'users', type: 'TABLE', cascade: true },
            dropRelationships: referencedBy,
        });

        expect(screen.getByText(/CASCADE will also remove/)).toBeInTheDocument();
    });

    it('warns on truncate as well', () => {
        renderDialogs({
            truncateModal: {
                schema: 'public',
                tableName: 'users',
                cascade: false,
                restartIdentity: false,
            },
            truncateRelationships: referencedBy,
        });

        expect(screen.getByText('public.orders (user_id)')).toBeInTheDocument();
    });

    it('shows no warning when nothing references the table', () => {
        renderDialogs({
            dropModal: { schema: 'public', item: 'users', type: 'TABLE', cascade: false },
            dropRelationships: { status: 'ready', incoming: [] },
        });

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('still confirms the drop with the warning showing', () => {
        const props = renderDialogs({
            dropModal: { schema: 'public', item: 'users', type: 'TABLE', cascade: false },
            dropRelationships: referencedBy,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

        expect(props.onConfirmDrop).toHaveBeenCalledTimes(1);
    });
});
