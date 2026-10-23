// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DraftRow } from '../../lib/dataEditing';
import { makeCellId } from './resultPanelUtils';
import { useResultKeyboard } from './useResultKeyboard';

const { getClipboardTextMock, setClipboardTextMock, toastInfoMock } = vi.hoisted(() => ({
    getClipboardTextMock: vi.fn(),
    setClipboardTextMock: vi.fn().mockResolvedValue(undefined),
    toastInfoMock: vi.fn(),
}));

vi.mock('../../services/clipboardService', () => ({
    getClipboardText: getClipboardTextMock,
    setClipboardText: setClipboardTextMock,
}));

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({
        toast: {
            error: vi.fn(),
            info: toastInfoMock,
        },
    }),
}));

interface KeyboardHarnessProps {
    blurredColumnIndexes?: ReadonlySet<number>;
    selectedCells: Set<string>;
    displayRows: Array<{
        key: string;
        kind: 'persisted' | 'draft';
        persistedIndex?: number | null;
        values: string[];
        draft?: { id: string } | null;
    }>;
    rowOrder: Map<string, number>;
    onStateChange: (state: {
        editedCells: Map<string, string>;
        draftRows: DraftRow[];
        selectedCells: Set<string>;
    }) => void;
}

const KeyboardHarness: React.FC<KeyboardHarnessProps> = ({
    blurredColumnIndexes,
    selectedCells: initialSelectedCells,
    displayRows,
    rowOrder,
    onStateChange,
}) => {
    const [selectedCells, setSelectedCells] = React.useState(initialSelectedCells);
    const [editedCells, setEditedCells] = React.useState<Map<string, string>>(new Map());
    const [draftRows, setDraftRows] = React.useState<DraftRow[]>([]);

    React.useEffect(() => {
        onStateChange({ editedCells, draftRows, selectedCells });
    }, [draftRows, editedCells, onStateChange, selectedCells]);

    const { handleKeyDown } = useResultKeyboard({
        tabId: 'tab-1',
        result: {
            columns: ['id', 'name'],
            rows: [
                ['1', 'Alice'],
                ['2', 'Bob'],
            ],
            isDone: true,
            isSelect: true,
        },
        hasPendingChanges: false,
        viewMode: false,
        isEditable: true,
        selectedCells,
        setSelectedCells,
        selectedRowKeys: [],
        displayRows,
        displayRowsByKey: new Map(displayRows.map(row => [row.key, row])),
        rowOrder,
        editedCells,
        deletedRows: new Set<number>(),
        draftRows,
        isSavingDraftRows: false,
        blurredColumnIndexes,
        onSaveRequest: vi.fn(),
        onDeleteSelected: vi.fn(),
        onSetShowRightSidebar: vi.fn(),
        setEditedCells,
        setDraftRows,
    });

    return <div data-testid='result-panel' tabIndex={0} onKeyDown={handleKeyDown} />;
};

describe('useResultKeyboard', () => {
    const copyRows = [
        { key: 'p:0', kind: 'persisted' as const, persistedIndex: 0, values: ['1', 'Alice'] },
    ];
    const copyRowOrder = new Map<string, number>([['p:0', 0]]);

    it('copies the selection on Ctrl+C when no column is blurred', () => {
        setClipboardTextMock.mockClear();
        const { getByTestId } = render(
            <KeyboardHarness
                selectedCells={new Set([makeCellId('p:0', 1)])}
                displayRows={copyRows}
                rowOrder={copyRowOrder}
                onStateChange={vi.fn()}
            />,
        );

        fireEvent.keyDown(getByTestId('result-panel'), { key: 'c', ctrlKey: true });

        expect(setClipboardTextMock).toHaveBeenCalledWith('Alice');
    });

    it('refuses Ctrl+C when the selection includes a blurred column', () => {
        setClipboardTextMock.mockClear();
        toastInfoMock.mockClear();
        const { getByTestId } = render(
            <KeyboardHarness
                blurredColumnIndexes={new Set([1])}
                selectedCells={new Set([makeCellId('p:0', 0), makeCellId('p:0', 1)])}
                displayRows={copyRows}
                rowOrder={copyRowOrder}
                onStateChange={vi.fn()}
            />,
        );

        fireEvent.keyDown(getByTestId('result-panel'), { key: 'c', ctrlKey: true });

        expect(setClipboardTextMock).not.toHaveBeenCalled();
        expect(toastInfoMock).toHaveBeenCalledWith(
            'Selection contains blurred columns. Unblur to copy.',
        );
    });

    it('fills every selected cell on Ctrl+V paste', async () => {
        getClipboardTextMock.mockResolvedValue('pasted');
        const onStateChange = vi.fn();
        const displayRows = [
            {
                key: 'p:0',
                kind: 'persisted' as const,
                persistedIndex: 0,
                values: ['1', 'Alice'],
            },
            {
                key: 'p:1',
                kind: 'persisted' as const,
                persistedIndex: 1,
                values: ['2', 'Bob'],
            },
        ];
        const rowOrder = new Map<string, number>([
            ['p:0', 0],
            ['p:1', 1],
        ]);

        const { getByTestId } = render(
            <KeyboardHarness
                selectedCells={new Set([makeCellId('p:0', 0), makeCellId('p:1', 1)])}
                displayRows={displayRows}
                rowOrder={rowOrder}
                onStateChange={onStateChange}
            />,
        );

        fireEvent.keyDown(getByTestId('result-panel'), {
            key: 'v',
            ctrlKey: true,
        });

        await waitFor(() => {
            const lastCall =
                onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] ?? null;
            expect(lastCall?.editedCells.get('0:0')).toBe('pasted');
            expect(lastCall?.editedCells.get('1:1')).toBe('pasted');
            expect(Array.from(lastCall?.selectedCells ?? [])).toEqual(['p:0|0', 'p:1|1']);
        });
    });
});
