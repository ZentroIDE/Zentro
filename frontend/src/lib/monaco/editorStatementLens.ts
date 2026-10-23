// SPDX-License-Identifier: GPL-3.0-only

import type { languages, editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';
import { analyzeStatementRisk, splitSqlStatements } from '../writeSafety/writeSafety';

type MonacoInstance = Parameters<OnMount>[1];

const statementHandlers = new Map<string, (startLine: number) => void>();
let lensInitialized = false;

export function getBlockText(model: editor.ITextModel, startLine: number): string {
    const lineCount = model.getLineCount();
    let endLine = startLine;
    while (endLine < lineCount && model.getLineContent(endLine + 1).trim() !== '') {
        endLine++;
    }
    // Strip leading pure-comment lines (e.g. commented-out statements above the real SQL).
    while (startLine <= endLine && model.getLineContent(startLine).trim().startsWith('--')) {
        startLine++;
    }
    // Strip trailing pure-comment lines (e.g. commented-out clauses below).
    while (endLine >= startLine && model.getLineContent(endLine).trim().startsWith('--')) {
        endLine--;
    }
    if (startLine > endLine) return '';
    return model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
    });
}

function stripCommentsFromLine(
    line: string,
    inBlockComment: boolean,
): { text: string; inBlockComment: boolean } {
    let text = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inBracket = false;
    let index = 0;

    while (index < line.length) {
        const ch = line[index];
        const next = index + 1 < line.length ? line[index + 1] : '';

        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                index += 2;
                continue;
            }
            index++;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !inBracket) {
            if (ch === '-' && next === '-') {
                break;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                index += 2;
                continue;
            }
        }

        text += ch;

        if (ch === "'" && !inDouble && !inBacktick && !inBracket) {
            if (inSingle && next === "'") {
                text += next;
                index += 2;
                continue;
            }
            inSingle = !inSingle;
        } else if (ch === '"' && !inSingle && !inBacktick && !inBracket) {
            if (inDouble && next === '"') {
                text += next;
                index += 2;
                continue;
            }
            inDouble = !inDouble;
        } else if (ch === '`' && !inSingle && !inDouble && !inBracket) {
            inBacktick = !inBacktick;
        } else if (ch === '[' && !inSingle && !inDouble && !inBacktick) {
            inBracket = true;
        } else if (ch === ']' && inBracket) {
            inBracket = false;
        }

        index++;
    }

    return { text, inBlockComment };
}

export function isExecutableSqlBlock(text: string): boolean {
    return splitSqlStatements(text).some(statement => {
        const operation = analyzeStatementRisk(statement).operation;
        return operation !== 'unknown';
    });
}

export function findExecutableStartLine(
    model: Pick<
        editor.ITextModel,
        'getLineCount' | 'getLineContent' | 'getValueInRange' | 'getLineMaxColumn'
    >,
    startLine: number,
): number | null {
    const blockText = getBlockText(model as editor.ITextModel, startLine);
    if (!isExecutableSqlBlock(blockText)) {
        return null;
    }

    const lineCount = model.getLineCount();
    let endLine = startLine;
    while (endLine < lineCount && model.getLineContent(endLine + 1).trim() !== '') {
        endLine++;
    }

    let inBlockComment = false;
    for (let line = startLine; line <= endLine; line++) {
        const rawLine = model.getLineContent(line);
        const stripped = stripCommentsFromLine(rawLine, inBlockComment);
        inBlockComment = stripped.inBlockComment;
        if (!stripped.text.trim()) {
            continue;
        }

        const candidateText = model.getValueInRange({
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: endLine,
            endColumn: model.getLineMaxColumn(endLine),
        });
        if (isExecutableSqlBlock(candidateText)) {
            return line;
        }
    }

    return null;
}

export function initStatementCodeLens(monaco: MonacoInstance): void {
    if (lensInitialized) return;
    lensInitialized = true;

    monaco.languages.registerCodeLensProvider('sql', {
        provideCodeLenses(model, token): languages.CodeLensList {
            const lineCount = model.getLineCount();
            const lenses: languages.CodeLens[] = [];
            let i = 1;
            while (i <= lineCount) {
                if (token.isCancellationRequested) break;
                while (i <= lineCount && model.getLineContent(i).trim() === '') i++;
                if (i > lineCount) break;
                const startLine = i;
                while (i <= lineCount && model.getLineContent(i).trim() !== '') i++;
                const executableStartLine = findExecutableStartLine(model, startLine);
                if (!executableStartLine) {
                    continue;
                }
                lenses.push({
                    range: {
                        startLineNumber: executableStartLine,
                        startColumn: 1,
                        endLineNumber: executableStartLine,
                        endColumn: 1,
                    },
                    command: {
                        id: 'zentro.runStatementAtLine',
                        title: '▶ Run',
                        arguments: [model.uri.toString(), startLine],
                    },
                });
            }
            return { lenses, dispose: () => {} };
        },
        resolveCodeLens(_model, codeLens) {
            return codeLens;
        },
    });

    monaco.editor.registerCommand(
        'zentro.runStatementAtLine',
        (_accessor, uri: string, startLine: number) => {
            statementHandlers.get(uri)?.(startLine);
        },
    );
}

export function registerStatementLensHandler(
    uri: string,
    handler: (startLine: number) => void,
): void {
    statementHandlers.set(uri, handler);
}

export function unregisterStatementLensHandler(uri: string): void {
    statementHandlers.delete(uri);
}
