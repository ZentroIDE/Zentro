// SPDX-License-Identifier: GPL-3.0-only

export interface SelectionInfo {
    line: number;
    column: number;
    selectedChars: number;
    selectedLines: number;
    cursorCount: number;
}

export const EMPTY_SELECTION_INFO: SelectionInfo = {
    line: 1,
    column: 1,
    selectedChars: 0,
    selectedLines: 0,
    cursorCount: 1,
};

interface SelectionRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

interface SelectionModel {
    // Monaco's EndOfLinePreference.LF is 1: count "\r\n" as one character so the
    // number matches what the user sees, regardless of the file's EOL.
    getValueLengthInRange(range: SelectionRange, eol?: 1): number;
}

const EOL_LF = 1 as const;

export function computeSelectionInfo(
    model: SelectionModel,
    selections: readonly SelectionRange[],
    position: { lineNumber: number; column: number } | null,
): SelectionInfo {
    let selectedChars = 0;
    let selectedLines = 0;
    for (const range of selections) {
        const isEmpty =
            range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
        if (isEmpty) continue;
        selectedChars += model.getValueLengthInRange(range, EOL_LF);
        selectedLines += range.endLineNumber - range.startLineNumber + 1;
    }
    return {
        line: position?.lineNumber ?? 1,
        column: position?.column ?? 1,
        selectedChars,
        selectedLines,
        cursorCount: Math.max(1, selections.length),
    };
}

export function selectionInfoEquals(a: SelectionInfo, b: SelectionInfo): boolean {
    return (
        a.line === b.line &&
        a.column === b.column &&
        a.selectedChars === b.selectedChars &&
        a.selectedLines === b.selectedLines &&
        a.cursorCount === b.cursorCount
    );
}

export function formatSelectionInfo(info: SelectionInfo): string {
    const parts = [`Ln ${info.line}, Col ${info.column}`];
    if (info.selectedChars > 0) {
        let selected = `${info.selectedChars.toLocaleString()} selected`;
        if (info.selectedLines > 1) selected += ` (${info.selectedLines} lines)`;
        parts.push(selected);
    }
    if (info.cursorCount > 1) parts.push(`${info.cursorCount} cursors`);
    return parts.join('  ·  ');
}
