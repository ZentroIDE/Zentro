// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResultTable } from './ResultTable';

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        query: {
            fetchMoreRows: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        },
    }),
}));

const mockResults: Record<string, unknown> = {};

vi.mock('../../stores/resultStore', () => ({
    useResultStore: () => ({
        results: mockResults,
        setOffset: vi.fn(),
        clearFetchingMore: vi.fn(),
    }),
}));

const { toastInfoMock } = vi.hoisted(() => ({ toastInfoMock: vi.fn() }));

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({
        toast: {
            error: vi.fn(),
            info: toastInfoMock,
        },
    }),
}));

// The real virtualizer hands back the same array while the visible range is unchanged, and the
// memoized grid depends on that. The default mock builds a fresh array per call, which re-renders
// the grid on every parent render; tests that need the real memo behaviour opt in to a stable one.
const { virtualizerMock } = vi.hoisted(() => ({
    virtualizerMock: { stableItems: false, cache: new Map<number, unknown[]>() },
}));

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count }: { count: number }) => ({
        getVirtualItems: () => {
            const build = () =>
                Array.from({ length: count }, (_, index) => ({
                    index,
                    key: index,
                    start: index * 22,
                    end: (index + 1) * 22,
                    size: 22,
                }));
            if (!virtualizerMock.stableItems) return build();
            let items = virtualizerMock.cache.get(count);
            if (!items) {
                items = build();
                virtualizerMock.cache.set(count, items);
            }
            return items;
        },
        getTotalSize: () => count * 22,
        scrollToIndex: vi.fn(),
        measure: vi.fn(),
    }),
}));

describe('ResultTable', () => {
    afterEach(() => {
        virtualizerMock.stableItems = false;
    });

    const EditableHarness: React.FC<{
        tabId: string;
        columns?: string[];
        rows?: string[][];
        blurredColumnIndexes?: Set<number>;
    }> = ({ tabId, columns = ['id', 'name'], rows = [['1', 'Alice']], blurredColumnIndexes }) => {
        const [editedCells, setEditedCells] = React.useState<Map<string, string>>(new Map());
        const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
        const [selectedRowKeys, setSelectedRowKeys] = React.useState<Set<string>>(new Set());
        const [draftRows, setDraftRows] = React.useState<any[]>([]);

        return (
            <ResultTable
                tabId={tabId}
                columns={columns}
                rows={rows}
                isDone={true}
                editedCells={editedCells}
                setEditedCells={setEditedCells}
                selectedCells={selectedCells}
                setSelectedCells={setSelectedCells}
                selectedRowKeys={selectedRowKeys}
                setSelectedRowKeys={setSelectedRowKeys}
                draftRows={draftRows}
                setDraftRows={setDraftRows}
                columnDefs={
                    columns.map((column, index) => ({
                        Name: column,
                        DataType: index === 0 ? 'integer' : 'character varying',
                    })) as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
                blurredColumnIndexes={blurredColumnIndexes}
            />
        );
    };

    const DirtySelectionHarness: React.FC = () => {
        const [editedCells, setEditedCells] = React.useState<Map<string, string>>(
            () =>
                new Map([
                    ['0:1', 'Alice 2'],
                    ['1:1', 'Bob 2'],
                ]),
        );
        const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
        const [selectedRowKeys, setSelectedRowKeys] = React.useState<Set<string>>(
            () => new Set(['p:0', 'p:1']),
        );
        const [draftRows, setDraftRows] = React.useState<any[]>([]);

        return (
            <ResultTable
                tabId='tab-multi-revert'
                columns={['id', 'name']}
                rows={[
                    ['1', 'Alice'],
                    ['2', 'Bob'],
                ]}
                isDone={true}
                editedCells={editedCells}
                setEditedCells={setEditedCells}
                selectedCells={selectedCells}
                setSelectedCells={setSelectedCells}
                selectedRowKeys={selectedRowKeys}
                setSelectedRowKeys={setSelectedRowKeys}
                draftRows={draftRows}
                setDraftRows={setDraftRows}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />
        );
    };

    it('renders compact data type on header and sticky index column', () => {
        render(
            <ResultTable
                tabId='tab-1'
                columns={['id', 'name']}
                rows={[
                    ['1', 'Alice'],
                    ['2', 'Bob'],
                ]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        expect(screen.getByTitle('character varying')).toBeInTheDocument();
        const readonlyIndicator = screen.getByTitle(
            'Read-only (No Primary Key or missing PK in SELECT)',
        );
        const indexHeader = readonlyIndicator.closest('th');
        expect(indexHeader?.className).toContain('rt-index-sticky');
    });

    it('auto-fits column width when double-clicking resize handle', () => {
        const longText = 'customer_name_with_very_long_value_to_expand_column_width';
        const { container } = render(
            <ResultTable
                tabId='tab-2'
                columns={['id', 'name']}
                rows={[
                    ['1', longText],
                    ['2', 'Bob'],
                ]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        const nameHeader = screen.getByText('name').closest('th') as HTMLTableCellElement;
        expect(nameHeader).toBeTruthy();
        const initialWidth = Number.parseInt(nameHeader.style.width || '0', 10);

        const resizer = nameHeader.querySelector('.rt-col-resizer') as HTMLElement;
        expect(resizer).toBeTruthy();
        fireEvent.doubleClick(resizer);

        const updatedHeader = container.querySelectorAll('th')[2] as HTMLTableCellElement;
        const nextWidth = Number.parseInt(updatedHeader.style.width || '0', 10);
        expect(nextWidth).toBeGreaterThan(initialWidth);
    });

    it('emits cell context menu payload and selects right-clicked cell', () => {
        const onCellContextMenu = vi.fn();
        const setSelectedCells = vi.fn();

        render(
            <ResultTable
                tabId='tab-ctx'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={setSelectedCells}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
                onCellContextMenu={onCellContextMenu}
            />,
        );

        fireEvent.contextMenu(screen.getByText('Alice'), {
            clientX: 220,
            clientY: 140,
        });

        expect(setSelectedCells).toHaveBeenCalledWith(new Set(['p:0|1']));
        expect(onCellContextMenu).toHaveBeenCalledWith(
            expect.objectContaining({
                x: 220,
                y: 140,
                rowKey: 'p:0',
                colIdx: 1,
                cellKey: 'p:0::name',
                target: 'cell',
            }),
        );
    });

    it('applies blur styling to manually blurred columns', () => {
        render(
            <ResultTable
                tabId='tab-blur'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
                blurredColumnIndexes={new Set([1])}
            />,
        );

        expect(screen.getByText('Alice').className).toContain('rt-cell-blurred');
        expect(screen.getByTitle('1').className).not.toContain('rt-cell-blurred');
    });

    it('applies a blur toggle immediately, without any click in the table', () => {
        virtualizerMock.stableItems = true;
        virtualizerMock.cache.clear();
        // Stable references, like the panel's state: fresh ones would re-render the memoized
        // grid on their own and hide the bug.
        const editedCells = new Map<string, string>();
        const selectedCells = new Set<string>();
        const selectedRowKeys = new Set<string>();
        const draftRows: any[] = [];
        const columnDefs = [
            { Name: 'id', DataType: 'integer' },
            { Name: 'name', DataType: 'character varying' },
        ] as any;
        const rows = [['1', 'Alice']];
        const columns = ['id', 'name'];
        const noop = vi.fn();
        const renderTable = (blurred: Set<number> | undefined) => (
            <ResultTable
                tabId='tab-blur-toggle'
                columns={columns}
                rows={rows}
                isDone={true}
                editedCells={editedCells}
                setEditedCells={noop}
                selectedCells={selectedCells}
                setSelectedCells={noop}
                selectedRowKeys={selectedRowKeys}
                setSelectedRowKeys={noop}
                draftRows={draftRows}
                setDraftRows={noop}
                columnDefs={columnDefs}
                focusCellRequest={null}
                onFocusCellRequestHandled={noop}
                onRemoveDraftRows={noop}
                onViewStatsChange={noop}
                blurredColumnIndexes={blurred}
            />
        );

        const { rerender } = render(renderTable(undefined));
        expect(screen.getByText('Alice').className).not.toContain('rt-cell-blurred');

        rerender(renderTable(new Set([1])));
        expect(screen.getByText('Alice').className).toContain('rt-cell-blurred');

        rerender(renderTable(new Set()));
        expect(screen.getByText('Alice').className).not.toContain('rt-cell-blurred');
    });

    it('masks the tooltip of blurred cells instead of revealing the value', () => {
        render(
            <ResultTable
                tabId='tab-blur-tooltip'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
                blurredColumnIndexes={new Set([1])}
            />,
        );

        expect(screen.queryByTitle('Alice')).toBeNull();
    });

    it('highlights the sticky index cell when any cell in the row is selected', () => {
        const { container } = render(
            <ResultTable
                tabId='tab-row-highlight'
                columns={['id', 'name']}
                rows={[
                    ['1', 'Alice'],
                    ['2', 'Bob'],
                ]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set(['p:0|1'])}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        const stickyIndexCells = container.querySelectorAll('tbody td.rt-index-sticky');
        expect(stickyIndexCells[0]?.className).toContain('rt-index-sticky-row-selected');
        expect(stickyIndexCells[1]?.className).not.toContain('rt-index-sticky-row-selected');
    });

    it('selects every row dragged across on the index column, not just the first', () => {
        const { container } = render(
            <EditableHarness
                tabId='tab-row-drag'
                columns={['id', 'name']}
                rows={[
                    ['1', 'Alice'],
                    ['2', 'Bob'],
                    ['3', 'Carol'],
                ]}
            />,
        );

        const stickyIndexCells = () =>
            Array.from(container.querySelectorAll('tbody td.rt-index-sticky'));

        fireEvent.mouseDown(stickyIndexCells()[0], { button: 0 });
        fireEvent.mouseEnter(stickyIndexCells()[1], { buttons: 1 });
        fireEvent.mouseEnter(stickyIndexCells()[2], { buttons: 1 });
        fireEvent.mouseUp(window);

        const selected = stickyIndexCells().map(cell =>
            cell.className.includes('rt-index-sticky-row-selected'),
        );
        expect(selected).toEqual([true, true, true]);
    });

    it('extends the row-drag selection via mousemove when per-row mouseenter is missed', () => {
        const { container } = render(
            <EditableHarness
                tabId='tab-row-drag-mousemove'
                columns={['id', 'name']}
                rows={[
                    ['1', 'Alice'],
                    ['2', 'Bob'],
                    ['3', 'Carol'],
                ]}
            />,
        );

        const rows = () => Array.from(container.querySelectorAll('tbody tr[data-rt-row]'));
        const stickyIndexCells = () =>
            Array.from(container.querySelectorAll('tbody td.rt-index-sticky'));

        if (!document.elementFromPoint) {
            (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint =
                () => null;
        }
        const elementFromPointSpy = vi
            .spyOn(document, 'elementFromPoint')
            .mockImplementation(() => rows()[2]);

        fireEvent.mouseDown(stickyIndexCells()[0], { button: 0 });
        // No mouseenter fired on rows 1/2 - only the global mousemove fallback runs.
        fireEvent.mouseMove(window, { clientX: 10, clientY: 10, buttons: 1 });
        fireEvent.mouseUp(window);

        const selected = stickyIndexCells().map(cell =>
            cell.className.includes('rt-index-sticky-row-selected'),
        );
        expect(selected).toEqual([true, true, true]);

        elementFromPointSpy.mockRestore();
    });

    it('opens a floating textarea editor on double click for editable cells', async () => {
        mockResults['tab-edit-open'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        const { container } = render(<EditableHarness tabId='tab-edit-open' />);

        fireEvent.doubleClick(screen.getByText('Alice'));

        const textarea = await screen.findByRole('textbox');
        expect(textarea.className).toContain('rt-floating-textarea-editor');
        expect((textarea as HTMLTextAreaElement).value).toBe('Alice');
        expect(container.querySelector('.result-table-tanstack')).toBeTruthy();

        delete mockResults['tab-edit-open'];
    });

    it('does not open the editor on a blurred cell and tells the user why', () => {
        mockResults['tab-edit-blurred'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };
        toastInfoMock.mockClear();

        render(<EditableHarness tabId='tab-edit-blurred' blurredColumnIndexes={new Set([1])} />);

        fireEvent.doubleClick(screen.getByText('Alice'));

        expect(screen.queryByRole('textbox')).toBeNull();
        expect(toastInfoMock).toHaveBeenCalledWith('This column is blurred. Unblur it to edit.');

        delete mockResults['tab-edit-blurred'];
    });

    it('still opens the editor on cells outside the blurred columns', async () => {
        mockResults['tab-edit-unblurred'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        render(
            <EditableHarness
                tabId='tab-edit-unblurred'
                columns={['id', 'name', 'email']}
                rows={[['1', 'Alice', 'a@x.com']]}
                blurredColumnIndexes={new Set([2])}
            />,
        );

        fireEvent.doubleClick(screen.getByText('Alice'));

        expect(await screen.findByRole('textbox')).toBeInTheDocument();

        delete mockResults['tab-edit-unblurred'];
    });

    it('commits edits on Enter and marks the cell dirty', async () => {
        mockResults['tab-edit-enter'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        render(<EditableHarness tabId='tab-edit-enter' />);

        fireEvent.doubleClick(screen.getByText('Alice'));
        const textarea = await screen.findByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'Alice 2' } });
        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(screen.queryByRole('textbox')).toBeNull();
            expect(screen.getByText('Alice 2').className).toContain('rt-cell-dirty');
        });

        delete mockResults['tab-edit-enter'];
    });

    it('reverts all selected dirty rows when double-clicking a dirty cell in the selection', async () => {
        mockResults['tab-multi-revert'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        render(<DirtySelectionHarness />);

        expect(screen.getByText('Alice 2').className).toContain('rt-cell-dirty');
        expect(screen.getByText('Bob 2').className).toContain('rt-cell-dirty');

        fireEvent.doubleClick(screen.getByText('Alice 2'));

        await waitFor(() => {
            expect(screen.getByText('Alice').className).not.toContain('rt-cell-dirty');
            expect(screen.getByText('Bob').className).not.toContain('rt-cell-dirty');
        });

        expect(screen.queryByRole('textbox')).toBeNull();

        delete mockResults['tab-multi-revert'];
    });

    it('keeps the floating textarea open on Shift+Enter and supports Tab navigation', async () => {
        mockResults['tab-edit-nav'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        render(
            <EditableHarness
                tabId='tab-edit-nav'
                columns={['id', 'name', 'city']}
                rows={[['1', 'Alice', 'Paris']]}
            />,
        );

        fireEvent.doubleClick(screen.getByText('Alice'));
        const textarea = await screen.findByRole('textbox');

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
        expect(screen.getByRole('textbox')).toBe(textarea);

        fireEvent.change(textarea, { target: { value: 'Alice 2' } });
        fireEvent.keyDown(textarea, { key: 'Tab' });

        await waitFor(() => {
            const movedTextarea = screen.getByRole('textbox') as HTMLTextAreaElement;
            expect(movedTextarea.value).toBe('Paris');
        });

        delete mockResults['tab-edit-nav'];
    });

    it('cancels edits on Escape and blocks editing for read-only results', async () => {
        mockResults['tab-edit-escape'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
        };

        const editableView = render(<EditableHarness tabId='tab-edit-escape' />);

        fireEvent.doubleClick(screen.getByText('Alice'));
        const textarea = await screen.findByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'Alice 2' } });
        fireEvent.keyDown(textarea, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('textbox')).toBeNull();
            expect(screen.getByText('Alice').className).not.toContain('rt-cell-dirty');
        });

        delete mockResults['tab-edit-escape'];
        editableView.unmount();

        render(
            <ResultTable
                tabId='tab-readonly'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        fireEvent.doubleClick(screen.getAllByText('Alice')[0]);
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('shows datetime timezone suffix as read-only helper and does not mark unchanged blur as dirty', async () => {
        mockResults['tab-edit-datetime'] = {
            hasMore: false,
            tableName: 'events',
            primaryKeys: ['id'],
        };

        render(
            <EditableHarness
                tabId='tab-edit-datetime'
                columns={['id', 'created_at']}
                rows={[['1', '2026-03-25 09:48:19.096749 +0700 +07']]}
            />,
        );

        fireEvent.doubleClick(screen.getByText('2026-03-25 09:48:19.096749 +0700 +07'));

        const textarea = await screen.findByRole('textbox');
        expect((textarea as HTMLTextAreaElement).value).toBe('2026-03-25 09:48:19.096749');
        expect(screen.getByText('+0700 +07')).toBeInTheDocument();

        fireEvent.blur(textarea);

        await waitFor(() => {
            const cell = screen.getByText('2026-03-25 09:48:19.096749 +0700 +07');
            expect(cell.className).not.toContain('rt-cell-dirty');
        });

        delete mockResults['tab-edit-datetime'];
    });

    it('preserves datetime timezone suffix on save while editing only the main timestamp text', async () => {
        mockResults['tab-edit-datetime-save'] = {
            hasMore: false,
            tableName: 'events',
            primaryKeys: ['id'],
        };

        render(
            <EditableHarness
                tabId='tab-edit-datetime-save'
                columns={['id', 'created_at']}
                rows={[['1', '2026-03-25 09:48:19.096749 +0700 +07']]}
            />,
        );

        fireEvent.doubleClick(screen.getByText('2026-03-25 09:48:19.096749 +0700 +07'));

        const textarea = await screen.findByRole('textbox');
        fireEvent.change(textarea, { target: { value: '2026-03-25 10:00:00.000000' } });
        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(screen.getByText('2026-03-25 10:00:00.000000 +0700 +07').className).toContain(
                'rt-cell-dirty',
            );
        });

        delete mockResults['tab-edit-datetime-save'];
    });

    it('disables client-side sorting when server ORDER BY is active', () => {
        mockResults['tab-order'] = {
            hasMore: false,
            orderByExpr: 'id DESC',
        };

        render(
            <ResultTable
                tabId='tab-order'
                columns={['id', 'name']}
                rows={[
                    ['2', 'Bob'],
                    ['1', 'Alice'],
                ]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        const idHeader = screen.getByText('id').closest('th');
        expect(idHeader?.className).not.toContain('rt-th-sortable');

        delete mockResults['tab-order'];
    });

    it('renders nulls explicitly and preserves numeric text without scientific notation', () => {
        render(
            <ResultTable
                tabId='tab-format'
                columns={['amount', 'notes']}
                rows={
                    [
                        ['9000000000', null as any],
                        ['109.809', 'ok'],
                    ] as any
                }
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'amount', DataType: 'numeric' },
                        { Name: 'notes', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        expect(screen.getByText('9000000000')).toBeInTheDocument();
        expect(screen.queryByText(/e\+/i)).toBeNull();
        expect(screen.getByText('null')).toBeInTheDocument();
    });

    it('renders draft rows immediately alongside loaded rows', () => {
        mockResults['tab-draft-row'] = {
            hasMore: false,
            tableName: 'users',
            primaryKeys: ['id'],
            windowStartOffset: 0,
        };

        render(
            <ResultTable
                tabId='tab-draft-row'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[
                    {
                        id: 'draft-1',
                        kind: 'new',
                        values: ['', 'New user'],
                        insertAfterRowIndex: null,
                    },
                ]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        expect(screen.getByText('New user')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();

        delete mockResults['tab-draft-row'];
    });

    it('shows the loading row in the virtual slot past the loaded window', () => {
        mockResults['tab-fetching'] = {
            hasMore: true,
            isFetchingMore: true,
            tableName: 'users',
            primaryKeys: ['id'],
            windowStartOffset: 0,
        };

        render(
            <ResultTable
                tabId='tab-fetching'
                columns={['id', 'name']}
                rows={[['1', 'Alice']]}
                isDone={true}
                editedCells={new Map()}
                setEditedCells={vi.fn()}
                selectedCells={new Set()}
                setSelectedCells={vi.fn()}
                selectedRowKeys={new Set()}
                setSelectedRowKeys={vi.fn()}
                draftRows={[]}
                setDraftRows={vi.fn()}
                columnDefs={
                    [
                        { Name: 'id', DataType: 'integer' },
                        { Name: 'name', DataType: 'character varying' },
                    ] as any
                }
                focusCellRequest={null}
                onFocusCellRequestHandled={vi.fn()}
                onRemoveDraftRows={vi.fn()}
                onViewStatsChange={vi.fn()}
            />,
        );

        const loadingRow = screen.getByText('Loading more rows...');
        expect(loadingRow).toBeInTheDocument();
        // It has to sit inside the reserved virtual slot, not after the scroll
        // spacer, or it lands outside the range the virtualizer positions.
        expect(loadingRow.closest('td')).toHaveClass('rt-placeholder-cell');

        delete mockResults['tab-fetching'];
    });
});
