// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { findExecutableStartLine, isExecutableSqlBlock } from './editorStatementLens';

function createModel(text: string) {
    const lines = text.split('\n');
    return {
        getLineCount: () => lines.length,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1] || '',
        getLineMaxColumn: (lineNumber: number) => (lines[lineNumber - 1] || '').length + 1,
        getValueInRange: ({
            startLineNumber,
            startColumn,
            endLineNumber,
            endColumn,
        }: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
        }) => {
            const selected = lines.slice(startLineNumber - 1, endLineNumber);
            if (selected.length === 0) return '';
            selected[0] = selected[0].slice(startColumn - 1);
            selected[selected.length - 1] = selected[selected.length - 1].slice(0, endColumn - 1);
            return selected.join('\n');
        },
    };
}

describe('editorStatementLens', () => {
    it('treats comment-only blocks as non-executable', () => {
        expect(isExecutableSqlBlock('-- 4333512')).toBe(false);
        expect(isExecutableSqlBlock('/* comment only */')).toBe(false);
    });

    it('treats SQL statements with inline comments as executable', () => {
        expect(isExecutableSqlBlock('SELECT * FROM users -- trailing comment')).toBe(true);
    });

    it('skips leading comment lines and places the lens on the first executable line', () => {
        const model = createModel(
            ['-- comment', '/* more context */', 'SELECT * FROM users;'].join('\n'),
        );
        expect(findExecutableStartLine(model, 1)).toBe(3);
    });

    it('does not place a lens on orphaned clauses', () => {
        const model = createModel(["-- WHERE foo = 'bar'", 'ORDER BY created_at DESC'].join('\n'));
        expect(findExecutableStartLine(model, 1)).toBe(null);
    });
});
