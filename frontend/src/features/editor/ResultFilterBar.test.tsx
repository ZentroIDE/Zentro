// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultFilterBar } from './ResultFilterBar';

// Mirrors the real editor closely enough to exercise WhereFilterBuilder's
// uncontrolled-editor + explicit-external-sync fix (see useFilterMonacoSetup's
// applyExternalValue): mounts with `defaultValue` only, and any correction the
// hook pushes back in (e.g. normalizing a pasted multi-line paste) has to go
// through the fake editor/model `onMount` hands it, exactly like production.
vi.mock('@monaco-editor/react', () => {
    return {
        default: ({
            defaultValue,
            onChange,
            onMount,
        }: {
            defaultValue?: string;
            onChange?: (next: string) => void;
            onMount?: (editor: unknown, monaco: unknown) => void;
        }) => {
            const [text, setText] = React.useState(defaultValue ?? '');
            const textRef = React.useRef(text);
            textRef.current = text;

            React.useEffect(() => {
                const model = {
                    getValue: () => textRef.current,
                    getFullModelRange: () => ({}),
                    validateRange: (range: unknown) => range,
                    pushEditOperations: (_before: unknown, edits: Array<{ text: string }>) => {
                        const next = edits[0]?.text ?? '';
                        textRef.current = next;
                        setText(next);
                        return null;
                    },
                };
                const editor = {
                    getModel: () => model,
                    getValue: () => textRef.current,
                    getSelection: () => null,
                    setSelection: () => {},
                    getDomNode: () => null,
                    focus: () => {},
                    onKeyDown: () => ({ dispose: () => {} }),
                    onDidFocusEditorWidget: () => ({ dispose: () => {} }),
                    onDidBlurEditorWidget: () => ({ dispose: () => {} }),
                    onDidDispose: () => ({ dispose: () => {} }),
                    createContextKey: () => ({ set: () => {} }),
                    addCommand: () => {},
                    trigger: () => {},
                };
                const monaco = {
                    KeyMod: { CtrlCmd: 0 },
                    KeyCode: { Space: 0, Escape: 0, Enter: 0 },
                    Uri: { parse: () => ({}) },
                    languages: {
                        registerCompletionItemProvider: () => ({ dispose: () => {} }),
                    },
                    editor: { getModel: () => null },
                };
                onMount?.(editor, monaco);
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, []);

            return (
                <textarea
                    data-testid='filter-editor'
                    value={text}
                    onChange={event => {
                        textRef.current = event.target.value;
                        setText(event.target.value);
                        onChange?.(event.target.value);
                    }}
                />
            );
        },
    };
});

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({
        toast: {
            success: vi.fn(),
            error: vi.fn(),
        },
    }),
}));

vi.mock('../../stores/settingsStore', () => ({
    useSettingsStore: () => ({
        theme: 'light',
    }),
}));

vi.mock('../../stores/connectionStore', () => ({
    useConnectionStore: (selector: (state: { activeProfile: { driver: string } }) => unknown) =>
        selector({ activeProfile: { driver: 'postgres' } }),
}));

vi.mock('../../services/clipboardService', () => ({
    setClipboardText: vi.fn().mockResolvedValue(undefined),
}));

const Harness: React.FC<{
    onRun: (filter?: string, orderBy?: string) => void;
    onClear: () => void;
}> = ({ onRun, onClear }) => {
    const [value, setValue] = React.useState('');
    const [orderValue, setOrderValue] = React.useState('');
    const columns = React.useMemo(() => ['id', 'created_at'], []);

    return (
        <ResultFilterBar
            value={value}
            onChange={setValue}
            orderValue={orderValue}
            onOrderChange={setOrderValue}
            onRun={onRun}
            onClear={onClear}
            columns={columns}
            baseQuery='select * from t'
        />
    );
};

describe('ResultFilterBar', () => {
    const switchToTextMode = () => {
        fireEvent.click(screen.getByTitle('Switch to text mode'));
    };

    it('does not auto-run when WHERE filter changes', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        const filterInput = screen.getByTestId('filter-editor');
        fireEvent.change(filterInput, { target: { value: 'id > 10' } });

        expect(onRun).not.toHaveBeenCalled();
        expect(onClear).not.toHaveBeenCalled();
    });

    it('normalizes pasted multi-line filter into a single line', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        const filterInput = screen.getByTestId('filter-editor') as HTMLInputElement;
        fireEvent.change(filterInput, {
            target: { value: 'a.account_id = 1\nOR a.account_id = 2' },
        });

        expect(filterInput.value).toBe('a.account_id = 1 OR a.account_id = 2');
        expect(onRun).not.toHaveBeenCalled();
        expect(onClear).not.toHaveBeenCalled();
    });

    it('does not auto-run when ORDER BY changes', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        switchToTextMode();
        const orderInput = screen.getByPlaceholderText('created_at DESC, id ASC');
        fireEvent.change(orderInput, { target: { value: 'created_at DESC' } });

        expect(onRun).not.toHaveBeenCalled();
        expect(onClear).not.toHaveBeenCalled();
    });

    it('runs immediately on Enter', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        switchToTextMode();
        const orderInput = screen.getByPlaceholderText('created_at DESC, id ASC');
        fireEvent.change(orderInput, { target: { value: 'id ASC' } });
        fireEvent.keyDown(orderInput, { key: 'Enter' });

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(onRun).toHaveBeenCalledWith('', 'id ASC');
        expect(onClear).not.toHaveBeenCalled();
    });

    it('edits term when clicking chip', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        switchToTextMode();
        const orderInput = screen.getByPlaceholderText('created_at DESC, id ASC');
        fireEvent.change(orderInput, { target: { value: 'id ASC' } });

        fireEvent.click(screen.getByTitle('Switch to chip mode'));
        fireEvent.click(screen.getByText('id'));
        fireEvent.click(screen.getByRole('button', { name: 'ASC' }));
        expect(screen.getByText('ASC')).toBeInTheDocument();
    });

    it('re-runs immediately when saving an edited chip', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        switchToTextMode();
        const orderInput = screen.getByPlaceholderText('created_at DESC, id ASC');
        fireEvent.change(orderInput, { target: { value: 'id ASC' } });

        fireEvent.click(screen.getByTitle('Switch to chip mode'));
        fireEvent.click(screen.getByText('id'));
        fireEvent.click(screen.getByRole('button', { name: 'DESC' }));

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(onRun).toHaveBeenCalledWith('', 'id DESC');
        expect(onClear).not.toHaveBeenCalled();
    });

    it('executes immediately when removing a chip', () => {
        const onRun = vi.fn();
        const onClear = vi.fn();
        render(<Harness onRun={onRun} onClear={onClear} />);

        switchToTextMode();
        const orderInput = screen.getByPlaceholderText('created_at DESC, id ASC');
        fireEvent.change(orderInput, { target: { value: 'id ASC' } });
        fireEvent.click(screen.getByTitle('Switch to chip mode'));

        fireEvent.click(screen.getByTitle('Remove order term'));
        expect(onClear).toHaveBeenCalled();
    });
});
