// SPDX-License-Identifier: GPL-3.0-only

export interface RunTargetPositionLike {
    lineNumber: number;
    column: number;
}

export interface RunTargetRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface RunTargetSelectionLike extends RunTargetRange {
    isEmpty(): boolean;
}

export interface RunTargetModelLike {
    getValueInRange(range: RunTargetRange): string;
    getLineContent(lineNumber: number): string;
    getLineCount(): number;
    getLineMaxColumn(lineNumber: number): number;
}

export interface RunTargetResult {
    query: string;
    range: RunTargetRange;
}

/** Resolves what a "run" action should execute: the current selection if
 *  non-empty, otherwise the contiguous non-blank-line block surrounding
 *  the cursor. Pure over the model/selection/position it's given — the
 *  caller reads these off a live editor (`editor.getModel()`,
 *  `editor.getSelection()`, `editor.getPosition()`, all structurally
 *  compatible with the *Like interfaces here). */
export function resolveRunnableQueryTarget(
    model: RunTargetModelLike | null,
    selection: RunTargetSelectionLike | null,
    position: RunTargetPositionLike | null,
): RunTargetResult | null {
    if (!model) return null;

    if (selection && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) return null;
        return { query: selectedText, range: selection };
    }

    if (!position) return null;

    const currentLine = position.lineNumber;
    const lineCount = model.getLineCount();

    if (model.getLineContent(currentLine).trim() === '') return null;

    let startLine = currentLine;
    while (startLine > 1) {
        if (model.getLineContent(startLine - 1).trim() === '') {
            break;
        }
        startLine--;
    }

    let endLine = currentLine;
    while (endLine < lineCount) {
        if (model.getLineContent(endLine + 1).trim() === '') {
            break;
        }
        endLine++;
    }

    const range: RunTargetRange = {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
    };
    const blockText = model.getValueInRange(range);

    if (!blockText.trim()) return null;

    return { query: blockText, range };
}
