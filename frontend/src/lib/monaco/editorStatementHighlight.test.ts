// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStatementHighlight } from './editorStatementHighlight';

function makeEditor(text: string, currentLine: number) {
    const lines = text.split('\n');
    let widget: { getDomNode(): HTMLElement } | null = null;
    const domNode = document.createElement('div');
    const disposable = () => ({ dispose: vi.fn() });

    return {
        _getWidget: () => widget,
        _domNode: domNode,
        addOverlayWidget: vi.fn(nextWidget => {
            widget = nextWidget;
        }),
        removeOverlayWidget: vi.fn(),
        getModel: vi.fn(() => ({
            getLineCount: () => lines.length,
            getLineContent: (lineNumber: number) => lines[lineNumber - 1] || '',
        })),
        getPosition: vi.fn(() => ({ lineNumber: currentLine, column: 1 })),
        getSelection: vi.fn(() => ({
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 3,
            endLineNumber: 2,
            endColumn: 14,
        })),
        getDomNode: vi.fn(() => domNode),
        getLayoutInfo: vi.fn(() => ({ contentLeft: 40, width: 500, height: 300 })),
        getScrollLeft: vi.fn(() => 0),
        getScrollTop: vi.fn(() => 0),
        getOffsetForColumn: vi.fn((_lineNumber: number, column: number) => (column - 1) * 10),
        getTopForLineNumber: vi.fn((lineNumber: number) => (lineNumber - 1) * 20),
        getLineHeightForPosition: vi.fn(() => 20),
        onDidChangeCursorPosition: vi.fn(disposable),
        onDidChangeCursorSelection: vi.fn(disposable),
        onDidChangeModelContent: vi.fn(disposable),
        onDidScrollChange: vi.fn(disposable),
        onDidLayoutChange: vi.fn(disposable),
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('setupStatementHighlight', () => {
    it('draws one transparent outline following the multiline selection silhouette', () => {
        vi.useFakeTimers();
        const editor = makeEditor('  SELECT e.  \nFROM orders o\n\nSELECT 1', 1);

        setupStatementHighlight(editor as never, {} as never);
        vi.runAllTimers();

        const svg = editor._getWidget()?.getDomNode();
        expect(svg?.classList.contains('zentro-active-statement-outline')).toBe(true);
        expect(svg?.style.width).toBe('500px');
        expect(svg?.style.height).toBe('300px');
        const path = svg?.querySelector('path')?.getAttribute('d');
        expect(path).toContain('M 60.5 5.5');
        expect(path).toContain('Q 60.5 0.5 65.5 0.5');
        expect(path).toContain('Q 170.5 40.5 165.5 40.5');
        expect(path).toContain('Q 40.5 20.5 45.5 20.5');
        expect(editor._domNode.classList.contains('zentro-statement-outline-only')).toBe(true);
    });

    it('removes the overlay widget when disposed', () => {
        vi.useFakeTimers();
        const editor = makeEditor('SELECT 1', 1);
        const manager = setupStatementHighlight(editor as never, {} as never);

        manager.dispose();

        expect(editor.removeOverlayWidget).toHaveBeenCalledTimes(1);
    });

    it('keeps Monaco background feedback for a partial text selection', () => {
        vi.useFakeTimers();
        const editor = makeEditor('SELECT 1\nFROM users', 1);
        editor.getSelection.mockReturnValue({
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 7,
        });

        setupStatementHighlight(editor as never, {} as never);
        vi.runAllTimers();

        expect(editor._domNode.classList.contains('zentro-statement-outline-only')).toBe(false);
    });
});
