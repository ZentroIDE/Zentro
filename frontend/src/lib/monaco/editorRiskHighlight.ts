// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';
import { getBlockText } from './editorStatementLens';
import { splitSqlStatements, analyzeStatementRisk } from '../writeSafety/writeSafety';

type MonacoInstance = Parameters<OnMount>[1];

type BlockRisk = 'destructive' | 'write' | null;

function classifyBlock(text: string): BlockRisk {
    let hasWrite = false;
    for (const stmt of splitSqlStatements(text)) {
        const { destructive, operation } = analyzeStatementRisk(stmt);
        if (destructive) return 'destructive';
        if (operation !== 'read' && operation !== 'unknown') hasWrite = true;
    }
    return hasWrite ? 'write' : null;
}

export function setupRiskHighlight(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
    isEnabled: () => boolean,
): { dispose: () => void; refresh: () => void } {
    const decorations = editor.createDecorationsCollection();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const render = () => {
        if (disposed) return;
        if (!isEnabled()) {
            decorations.clear();
            return;
        }
        const model = editor.getModel();
        if (!model) {
            decorations.clear();
            return;
        }

        const lineCount = model.getLineCount();
        const next: editor.IModelDeltaDecoration[] = [];

        let i = 1;
        while (i <= lineCount) {
            while (i <= lineCount && model.getLineContent(i).trim() === '') i++;
            if (i > lineCount) break;
            const startLine = i;
            while (i <= lineCount && model.getLineContent(i).trim() !== '') i++;
            const endLine = i - 1;

            const text = getBlockText(model as editor.ITextModel, startLine);
            if (!text) continue;

            const risk = classifyBlock(text);
            if (!risk) continue;

            next.push({
                range: new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)),
                options: {
                    isWholeLine: true,
                    className:
                        risk === 'destructive' ? 'zentro-risk-destructive' : 'zentro-risk-write',
                },
            });
        }

        decorations.set(next);
    };

    const schedule = () => {
        if (disposed) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            render();
        }, 200);
    };

    const contentDisposable = editor.onDidChangeModelContent(schedule);
    schedule();

    return {
        dispose: () => {
            disposed = true;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            contentDisposable.dispose();
            decorations.clear();
        },
        refresh: () => schedule(),
    };
}
