// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import { SQL_FUNCTIONS } from './sqlCompletionConstants';
import { SqlAnalysis, SqlClause, SuggestionRecord } from './sqlCompletionTypes';

const TABLE_TARGET_CLAUSES = new Set(['from', 'join', 'insert', 'update', 'delete']);

export function isAwaitingAlterTableTarget(analysis: SqlAnalysis): boolean {
    if (analysis.clause !== 'alterTable') return false;
    const cursorInStatement = Math.max(0, analysis.cursorOffset - analysis.statementStartOffset);
    const textBeforeCursor = analysis.statementText.slice(0, cursorInStatement);
    return /^\s*alter\s+table\s+(?:["`\[]?[\w$.-]*)?$/i.test(textBeforeCursor);
}

export function isTableTargetCompletionContext(analysis: SqlAnalysis): boolean {
    return TABLE_TARGET_CLAUSES.has(analysis.clause) || isAwaitingAlterTableTarget(analysis);
}

export function buildSelectLikeSuggestions(
    addKeyword: (label: string, insertText?: string, priority?: number) => void,
    addFunction: (label: string, snippet?: string, priority?: number) => void,
    addText: (label: string, insertText?: string, priority?: number) => void,
    addOperator: (label: string, insertText?: string, priority?: number) => void,
    functions: readonly string[] = SQL_FUNCTIONS,
) {
    addKeyword('SELECT', 'SELECT ', 5);
    [
        'CASE',
        'WHEN',
        'THEN',
        'ELSE',
        'END',
        'NULL',
        'NOT',
        'IN',
        'BETWEEN',
        'LIKE',
        'EXISTS',
    ].forEach(kw => addKeyword(kw, kw, 210));
    functions.forEach(fn => addFunction(fn, `${fn}($1)`, 120));
    addText('*', '*', 10);
    ['=', '<>', '!=', '>', '<', '>=', '<='].forEach(op => addOperator(op, `${op} `, 60));
}

export function normalizeInsertClause(analysis: SqlAnalysis): SqlClause | 'insertColumns' {
    if (
        analysis.clause === 'insert' &&
        /\binsert\s+into\b[\s\S]*\(\s*$/i.test(analysis.statementText)
    )
        return 'insertColumns';
    return analysis.clause;
}

export function makeSortText(priority: number, label: string): string {
    const offsetPriority = priority + 2000;
    return `${String(Math.max(0, offsetPriority)).padStart(5, '0')}_${label.toLowerCase()}`;
}

export function finalizeSuggestions(
    suggestionMap: Map<string, SuggestionRecord>,
): languages.CompletionItem[] {
    return Array.from(suggestionMap.values())
        .sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            const aLabel = String(a.item.label);
            const bLabel = String(b.item.label);
            return aLabel.localeCompare(bLabel);
        })
        .map(record => record.item);
}

export function getOffsetAtPosition(
    text: string,
    position: { lineNumber: number; column: number },
): number {
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < Math.max(0, position.lineNumber - 1); i++)
        offset += (lines[i]?.length ?? 0) + 1;
    offset += Math.max(0, position.column - 1);
    return Math.min(offset, text.length);
}
