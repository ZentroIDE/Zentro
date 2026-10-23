// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FKDetailSheet } from './FKDetailSheet';

const updateForeignKeyMock = vi.fn();

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        schema: {
            updateForeignKey: (...args: unknown[]) => updateForeignKeyMock(...args),
        },
    }),
}));

vi.mock('./FKFormBody', () => ({
    FKFormBody: ({
        onDelete,
        onUpdate,
        onDeleteChange,
        onUpdateChange,
    }: {
        onDelete: string;
        onUpdate: string;
        onDeleteChange: (value: 'NO ACTION' | 'CASCADE') => void;
        onUpdateChange: (value: 'NO ACTION' | 'CASCADE') => void;
    }) => (
        <div>
            <div data-testid='fk-delete-rule'>{onDelete}</div>
            <div data-testid='fk-update-rule'>{onUpdate}</div>
            <button type='button' onClick={() => onDeleteChange('NO ACTION')}>
                set delete no action
            </button>
            <button type='button' onClick={() => onUpdateChange('NO ACTION')}>
                set update no action
            </button>
        </div>
    ),
}));

describe('FKDetailSheet', () => {
    beforeEach(() => {
        updateForeignKeyMock.mockReset();
        updateForeignKeyMock.mockResolvedValue({ ok: true, data: undefined });
    });

    it('saves NO ACTION changes from ERD constraints with non-default original rules', async () => {
        const onClose = vi.fn();
        const onUpdated = vi.fn();

        render(
            <FKDetailSheet
                constraint={{
                    ConstraintName: 'fk_orders_account_id',
                    SourceTable: 'orders',
                    TargetTable: 'accounts',
                    columns: ['account_id'],
                    targets: ['id'],
                    OnDelete: 'CASCADE',
                    OnUpdate: 'CASCADE',
                }}
                schema='public'
                connectionID='local'
                dbName='db1'
                onClose={onClose}
                onUpdated={onUpdated}
            />,
        );

        expect(screen.getByTestId('fk-delete-rule')).toHaveTextContent('CASCADE');
        expect(screen.getByTestId('fk-update-rule')).toHaveTextContent('CASCADE');

        fireEvent.click(screen.getByRole('button', { name: 'set delete no action' }));

        const saveButton = screen.getByRole('button', { name: /save/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(updateForeignKeyMock).toHaveBeenCalledWith(
                'local',
                'db1',
                'public',
                'orders',
                'fk_orders_account_id',
                expect.objectContaining({
                    OnDelete: 'NO ACTION',
                    OnUpdate: 'CASCADE',
                }),
            );
        });
        expect(onUpdated).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
