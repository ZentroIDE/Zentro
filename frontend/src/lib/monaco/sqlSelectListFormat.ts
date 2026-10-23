// SPDX-License-Identifier: GPL-3.0-only

// Shared layout for generated select lists ("All columns" completion and the
// Expand `*` quick fix), so both produce the same shape.
//
// Long lists are written comma-first, one column per line:
//
//   SELECT
//         c.Name
//       , c.Id
//       , o.Id
//
// A leading comma means commenting out any line after the first never leaves
// a dangling comma on the line above it.

const SINGLE_LINE_COLUMN_LIMIT = 4;
const CONTINUATION_INDENT = '    ';
const COMMA_PREFIX = ', ';

export interface SelectListFormatOptions {
    /** Indentation of the line the list is inserted into. */
    lineIndent?: string;
    /** True when the first column must stay on the current line (e.g. after "c."). */
    firstColumnInline?: boolean;
}

function buildItemIndent(lineIndent = ''): string {
    return `${lineIndent}${CONTINUATION_INDENT}`;
}

/**
 * Columns appended after items that already exist in the list ("a, *"): every
 * column carries its own leading comma, so the result can replace ", *".
 */
export function formatSelectListContinuation(
    columns: string[],
    options: Pick<SelectListFormatOptions, 'lineIndent'> = {},
): string {
    if (columns.length === 0) return '';
    if (columns.length <= SINGLE_LINE_COLUMN_LIMIT) {
        return `${COMMA_PREFIX}${columns.join(COMMA_PREFIX)}`;
    }
    const itemIndent = buildItemIndent(options.lineIndent);
    return columns.map(column => `\n${itemIndent}${COMMA_PREFIX}${column}`).join('');
}

/** Leading spaces/tabs of a line, to indent generated multi-line text like it. */
export function readLineIndent(lineText: string): string {
    return /^[ \t]*/.exec(lineText)?.[0] ?? '';
}

export function formatSelectList(columns: string[], options: SelectListFormatOptions = {}): string {
    if (columns.length <= SINGLE_LINE_COLUMN_LIMIT) return columns.join(COMMA_PREFIX);

    const itemIndent = buildItemIndent(options.lineIndent);
    const [first, ...rest] = columns;
    const followingLines = rest.map(column => `\n${itemIndent}${COMMA_PREFIX}${column}`).join('');
    if (options.firstColumnInline) return `${first}${followingLines}`;

    // Align the first column under the ones that follow the comma.
    const firstColumnPadding = ' '.repeat(COMMA_PREFIX.length);
    return `\n${itemIndent}${firstColumnPadding}${first}${followingLines}`;
}
