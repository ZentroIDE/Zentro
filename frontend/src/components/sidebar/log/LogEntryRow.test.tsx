// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { app } from '../../../../wailsjs/go/models';
import { LogEntryRow } from './LogEntryRow';

vi.mock('./logActions', () => ({
    copyAuditEntry: vi.fn(),
    openAuditEntryInNewTab: vi.fn(),
}));

function createEntry(overrides: Partial<app.SQLAuditEntry> = {}): app.SQLAuditEntry {
    return {
        id: 'audit-1',
        executed_at: '2026-06-02T08:14:00.000Z',
        source_tab_id: 'tab-1',
        tab_id: 'tab-1',
        statement_text: 'DELETE FROM "app"."orders" WHERE "order_id" = 100008',
        statement_index: 0,
        statement_count: 1,
        profile: 'Zentro Demo',
        database: 'zentro_pro',
        driver: 'postgres',
        env_key: 'pro',
        project_id: 'project-1',
        duration_ms: 8,
        row_count: 1,
        is_select: false,
        reason: 'Remove duplicated order after reconciliation',
        risk_level: 'high',
        preview_row_count: 1,
        used_protection_layers: [],
        snapshot_ref: '',
        pinned: false,
        error: '',
        ...overrides,
    };
}

describe('LogEntryRow', () => {
    it('renders full environment label and reason copy', () => {
        render(
            <LogEntryRow
                entry={createEntry()}
                onPaste={vi.fn()}
                onPin={vi.fn()}
                onCopy={vi.fn()}
                onOpenInNewTab={vi.fn()}
            />,
        );

        expect(screen.getByText('Production')).toBeInTheDocument();
        expect(screen.getByText('Reason')).toBeInTheDocument();
        expect(
            screen.getByText('Remove duplicated order after reconciliation'),
        ).toBeInTheDocument();
        expect(screen.getByTitle('Executed in Production')).toBeInTheDocument();
    });

    it('does not expose click-to-paste behavior on the row body', () => {
        const onPaste = vi.fn();
        render(
            <LogEntryRow
                entry={createEntry()}
                onPaste={onPaste}
                onPin={vi.fn()}
                onCopy={vi.fn()}
                onOpenInNewTab={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByText(/DELETE FROM "app"\."orders"/i));

        expect(onPaste).not.toHaveBeenCalled();
    });

    it('opens context menu actions without inline action buttons', () => {
        render(
            <LogEntryRow
                entry={createEntry()}
                onPaste={vi.fn()}
                onPin={vi.fn()}
                onCopy={vi.fn()}
                onOpenInNewTab={vi.fn()}
            />,
        );

        expect(screen.queryByTitle('Copy SQL')).not.toBeInTheDocument();
        fireEvent.contextMenu(screen.getByText(/DELETE FROM "app"\."orders"/i));

        expect(screen.getByText('Paste Into Editor')).toBeInTheDocument();
        expect(screen.getByText('Copy SQL')).toBeInTheDocument();
        expect(screen.getByText('Open In New Tab')).toBeInTheDocument();
        expect(screen.getByText('Pin')).toBeInTheDocument();
    });
});
