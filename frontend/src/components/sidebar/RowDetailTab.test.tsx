// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RowDetailTab } from './RowDetailTab';
import { useRowDetailStore } from '../../stores/rowDetailStore';
import { useSidebarUiStore } from '../../stores/sidebarUiStore';
import { STORAGE_KEY } from '../../lib/constants';

const { toastSuccessMock, toastErrorMock, toastInfoMock, setClipboardTextMock } = vi.hoisted(
    () => ({
        toastSuccessMock: vi.fn(),
        toastErrorMock: vi.fn(),
        toastInfoMock: vi.fn(),
        setClipboardTextMock: vi.fn().mockResolvedValue(undefined),
    }),
);

vi.mock('../layout/Toast', () => ({
    useToast: () => ({
        toast: {
            success: toastSuccessMock,
            error: toastErrorMock,
            info: toastInfoMock,
        },
    }),
}));

vi.mock('../../services/clipboardService', () => ({
    setClipboardText: setClipboardTextMock,
}));

vi.mock('../viewers/JsonViewer', () => ({
    JsonViewer: ({ value }: { value: string }) => <pre data-testid='json-viewer'>{value}</pre>,
}));

describe('RowDetailTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRowDetailStore.setState({ detail: null });
        localStorage.removeItem(STORAGE_KEY.SIDEBAR_UI);
        useSidebarUiStore.setState({ contextStates: {} });
    });

    it('edits and commits field values, then disables editor in select mode', () => {
        const onSave = vi.fn();
        useRowDetailStore.setState({
            detail: {
                columns: ['name'],
                row: ['Alice'],
                primaryKeys: [],
                onSave,
            },
        });

        render(<RowDetailTab />);

        // Display is a div — click it to open the textarea editor
        fireEvent.click(screen.getByTitle('Click to edit'));
        const textarea = screen.getByTitle(
            'Enter to save | Shift+Enter for newline | Esc to cancel',
        ) as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'Alice 2' } });
        fireEvent.keyDown(textarea, { key: 'Enter' });
        expect(onSave).toHaveBeenCalledWith(0, 'Alice 2');

        // After Enter the textarea closes; click the display div again
        fireEvent.click(screen.getByTitle('Click to edit'));
        const textarea2 = screen.getByTitle(
            'Enter to save | Shift+Enter for newline | Esc to cancel',
        ) as HTMLTextAreaElement;
        fireEvent.change(textarea2, { target: { value: 'Alice 3' } });
        fireEvent.keyDown(textarea2, { key: 'Escape' });
        // After Escape the display div shows the reverted value
        expect(screen.getByTitle('Click to edit').textContent).toBe('Alice');

        fireEvent.click(screen.getByTitle('Toggle selection mode for custom JSON copy'));
        expect(screen.queryByTitle('Click to edit')).toBeNull();
        expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('copies selected fields as JSON in selection mode', async () => {
        useRowDetailStore.setState({
            detail: {
                columns: ['id', 'name'],
                row: ['1', 'Alice'],
                primaryKeys: ['id'],
            },
        });

        render(<RowDetailTab />);

        fireEvent.click(screen.getByTitle('Toggle selection mode for custom JSON copy'));
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        fireEvent.click(screen.getByTitle('Copy selected fields as JSON'));

        await waitFor(() => {
            expect(setClipboardTextMock).toHaveBeenCalledWith(
                JSON.stringify({ name: 'Alice' }, null, 2),
            );
        });
        expect(toastSuccessMock).toHaveBeenCalledWith('Copied 1 fields as JSON');
        expect(toastErrorMock).not.toHaveBeenCalled();
    });

    it('renders null and empty values as placeholders and keeps JSON-typed null fields visible', () => {
        useRowDetailStore.setState({
            detail: {
                columns: ['metadata', 'archived_at', 'parent_code'],
                columnTypes: ['jsonb', 'timestamp', 'varchar'],
                row: [null, null, ''],
                primaryKeys: [],
            },
        });

        render(<RowDetailTab />);

        expect(screen.getAllByText('[NULL]').length).toBeGreaterThan(2);
        expect(screen.getByText('metadata')).toBeInTheDocument();
        expect(screen.getByText('archived_at')).toBeInTheDocument();
        expect(screen.getByText('parent_code')).toBeInTheDocument();
    });

    it('renders datetime timezone suffix separately in display mode', () => {
        useRowDetailStore.setState({
            detail: {
                columns: ['archived_at'],
                columnTypes: ['timestamp'],
                row: ['2026-02-27 10:51:33.423 GMT+07:00'],
                primaryKeys: [],
            },
        });

        render(<RowDetailTab />);

        expect(screen.getByText('2026-02-27 10:51:33.423')).toBeInTheDocument();
        expect(screen.getByText('GMT+07:00')).toBeInTheDocument();
    });

    it('shows normalized data type labels alongside field names', () => {
        useRowDetailStore.setState({
            detail: {
                columns: ['meta_value', 'updated_at'],
                columnTypes: ['character varying', 'timestamp with time zone'],
                row: ['loc', '2026-03-31 22:00:00 +07'],
                primaryKeys: [],
            },
        });

        render(<RowDetailTab />);

        // Type info is rendered as icon title attributes, not visible text
        expect(screen.getAllByTitle('character varying').length).toBeGreaterThan(0);
        expect(screen.getAllByTitle('timestamp with time zone').length).toBeGreaterThan(0);
    });

    describe('blurred columns', () => {
        const blurredDetail = () => ({
            columns: ['id', 'email'],
            row: ['1', 'alice@example.com'],
            primaryKeys: ['id'],
            blurredColumnIndexes: new Set([1]),
        });

        it('blurs the value and disables the per-field copy button', () => {
            useRowDetailStore.setState({ detail: blurredDetail() });

            render(<RowDetailTab />);

            expect(screen.getByText('alice@example.com').className).toContain('rt-cell-blurred');
            expect(screen.getByText('1').className).not.toContain('rt-cell-blurred');
            const copyButtons = screen.getAllByRole('button', { hidden: true });
            const blurredCopy = copyButtons.find(
                button => button.getAttribute('title') === 'Unblur the column to copy',
            );
            expect(blurredCopy).toBeDisabled();
        });

        it('refuses to copy the row as JSON while a blurred column is included', () => {
            useRowDetailStore.setState({ detail: blurredDetail() });

            render(<RowDetailTab />);
            fireEvent.click(screen.getByTitle('Copy row as JSON'));

            expect(setClipboardTextMock).not.toHaveBeenCalled();
            expect(toastInfoMock).toHaveBeenCalledWith(
                'Selection contains blurred columns. Unblur to copy.',
            );
        });

        it('still copies a selection that leaves the blurred column out', async () => {
            useRowDetailStore.setState({ detail: blurredDetail() });

            render(<RowDetailTab />);
            fireEvent.click(screen.getByTitle('Toggle selection mode for custom JSON copy'));
            fireEvent.click(screen.getAllByRole('checkbox')[0]);
            fireEvent.click(screen.getByTitle('Copy selected fields as JSON'));

            await waitFor(() => {
                expect(setClipboardTextMock).toHaveBeenCalledWith(
                    JSON.stringify({ id: '1' }, null, 2),
                );
            });
        });

        it('does not open the editor on a blurred field, but still edits the others', () => {
            useRowDetailStore.setState({
                detail: {
                    columns: ['id', 'email', 'name'],
                    row: ['1', 'alice@example.com', 'Alice'],
                    primaryKeys: ['id'],
                    blurredColumnIndexes: new Set([1]),
                    onSave: vi.fn(),
                },
            });
            const editorTitle = 'Enter to save | Shift+Enter for newline | Esc to cancel';

            render(<RowDetailTab />);

            fireEvent.click(screen.getByTitle('Blurred: unblur the column to edit'));
            expect(screen.queryByTitle(editorTitle)).toBeNull();

            fireEvent.click(screen.getByTitle('Click to edit'));
            expect(screen.getByTitle(editorTitle)).toBeInTheDocument();
        });

        it('closes an open editor when its column becomes blurred', () => {
            useRowDetailStore.setState({
                detail: {
                    columns: ['id', 'email'],
                    row: ['1', 'alice@example.com'],
                    primaryKeys: ['id'],
                    onSave: vi.fn(),
                },
            });
            const editorTitle = 'Enter to save | Shift+Enter for newline | Esc to cancel';

            render(<RowDetailTab />);
            fireEvent.click(screen.getByTitle('Click to edit'));
            expect(screen.getByTitle(editorTitle)).toBeInTheDocument();

            act(() => {
                useRowDetailStore.setState({
                    detail: {
                        ...useRowDetailStore.getState().detail!,
                        blurredColumnIndexes: new Set([1]),
                    },
                });
            });

            expect(screen.queryByTitle(editorTitle)).toBeNull();
        });

        it('masks blurred values in the JSON view', () => {
            useRowDetailStore.setState({ detail: blurredDetail() });

            render(<RowDetailTab />);
            fireEvent.click(screen.getByTitle('Toggle JSON view'));

            const json = screen.getByTestId('json-viewer').textContent ?? '';
            expect(json).not.toContain('alice@example.com');
            expect(json).toContain('••••••');
        });
    });

    it('prefers column type metadata for JSON rendering and copies null fields in JSON output', async () => {
        useRowDetailStore.setState({
            detail: {
                columns: ['payload', 'name'],
                columnTypes: ['jsonb', 'varchar'],
                row: [null, 'Alice'],
                primaryKeys: [],
            },
        });

        render(<RowDetailTab />);

        fireEvent.click(screen.getByTitle('Copy row as JSON'));

        await waitFor(() => {
            expect(setClipboardTextMock).toHaveBeenCalledWith(
                JSON.stringify({ payload: null, name: 'Alice' }, null, 2),
            );
        });
    });
});
