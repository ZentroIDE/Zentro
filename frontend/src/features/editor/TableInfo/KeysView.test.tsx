// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeysView, type KeysPanelId } from './KeysView';

vi.mock('./IndexInfoView', () => ({
    IndexInfoView: ({ uniqueOnly }: { uniqueOnly?: boolean }) => (
        <div>{uniqueOnly ? 'unique-view' : 'index-view'}</div>
    ),
}));

vi.mock('./PrimaryKeyView', () => ({
    PrimaryKeyView: () => <div>primary-key-view</div>,
}));

vi.mock('./CheckConstraintsView', () => ({
    CheckConstraintsView: () => <div>check-view</div>,
}));

describe('KeysView', () => {
    it('lists tabs in Primary Key, Unique Keys, Indexes, Check Constraints order', () => {
        render(
            <KeysView
                connectionID='dev'
                dbName='db1'
                environmentKey='dev'
                schema='public'
                tableName='accounts'
                refreshKey={0}
                isActive
                activeTab='primary-key'
            />,
        );

        const tabs = screen.getAllByRole('tab', {
            name: /Primary Key|Unique Keys|Indexes|Check Constraints/,
        });
        expect(tabs.map(node => node.textContent)).toEqual([
            'Primary Key',
            'Unique Keys',
            'Indexes',
            'Check Constraints',
        ]);
    });

    it('shows only the active tab panel while keeping the others mounted', () => {
        render(
            <KeysView
                connectionID='dev'
                dbName='db1'
                environmentKey='dev'
                schema='public'
                tableName='accounts'
                refreshKey={0}
                isActive
                activeTab='primary-key'
            />,
        );

        expect(screen.getByText('primary-key-view').closest('div.hidden')).toBeNull();
        expect(screen.getByText('index-view').closest('div.hidden')).not.toBeNull();
    });

    it('reports tab selection through the controlled activeTab callback', () => {
        const handleActiveTabChange = vi.fn();

        render(
            <KeysView
                connectionID='dev'
                dbName='db1'
                environmentKey='dev'
                schema='public'
                tableName='accounts'
                refreshKey={0}
                isActive
                activeTab='primary-key'
                onActiveTabChange={handleActiveTabChange}
            />,
        );

        fireEvent.click(screen.getByText('Indexes'));

        expect(handleActiveTabChange).toHaveBeenCalledWith('indexes' satisfies KeysPanelId);
    });
});
