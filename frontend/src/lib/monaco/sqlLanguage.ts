// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import { language as monacoSql } from 'monaco-editor/esm/vs/basic-languages/sql/sql';
import { DRIVER_SQL_FUNCTIONS, SQL_FUNCTIONS } from './sqlCompletionConstants';

/**
 * Zentro's own tokenizer for the `sql` language.
 *
 * Monaco's built-in SQL grammar cannot be styled the way the SQL Editor Colors
 * settings need: it classifies JOIN as an operator and DECIMAL as a keyword,
 * colours only the brackets of `[Company Name]`, and its theme ships
 * `.sql`-specific rules (`string.sql`, `operator.sql`, `predefined.sql`) that
 * beat every preset's own colours. This grammar keeps the built-in word lists
 * but classifies tokens the way the settings describe them, and uses the
 * `.zsql` postfix so none of Monaco's `.sql` theme rules apply — presets and
 * the user's overrides are the only source of colour.
 */
export const SQL_TOKEN_POSTFIX = '.zsql';

const upper = (words: readonly string[]) => words.map(word => word.toUpperCase());
const unique = (words: readonly string[]) => Array.from(new Set(words));

const WORD_OPERATORS = [
    'AND',
    'OR',
    'NOT',
    'IN',
    'IS',
    'LIKE',
    'ILIKE',
    'BETWEEN',
    'EXISTS',
    'ANY',
    'SOME',
];

// Only names that are not also common column names (DATE, TEXT, TIME, JSON...).
const TYPES = [
    'INT',
    'INTEGER',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'MEDIUMINT',
    'DECIMAL',
    'NUMERIC',
    'FLOAT',
    'REAL',
    'DOUBLE',
    'MONEY',
    'SMALLMONEY',
    'VARCHAR',
    'NVARCHAR',
    'VARCHAR2',
    'CHAR',
    'NCHAR',
    'NTEXT',
    'DATETIME',
    'DATETIME2',
    'SMALLDATETIME',
    'DATETIMEOFFSET',
    'UNIQUEIDENTIFIER',
    'VARBINARY',
    'BOOLEAN',
    'SERIAL',
    'BIGSERIAL',
    'JSONB',
    'BYTEA',
];

const wordOperators = WORD_OPERATORS;
const types = TYPES;
const functionNames = unique([
    ...upper(monacoSql.builtinFunctions),
    ...upper(SQL_FUNCTIONS),
    ...Object.values(DRIVER_SQL_FUNCTIONS).flatMap(list => upper(list)),
]);
// Function names Monaco also lists as keywords (COUNT, SUM, CAST...). They are
// only functions when called; bare, they are identifiers. A few really are
// keywords and stay that way.
const STAY_KEYWORDS = new Set(['LEFT', 'RIGHT', 'IF', 'REPLACE', 'CURRENT_TIMESTAMP', 'UPDATE']);
const callOnly = new Set([...functionNames].filter(name => !STAY_KEYWORDS.has(name)));
const excluded = new Set([...wordOperators, ...types, ...callOnly]);
const keywords = unique([
    ...upper(monacoSql.keywords),
    ...upper(monacoSql.operators.filter(word => /^[A-Za-z]+$/.test(word))),
    'NULL',
    'TRUE',
    'FALSE',
]).filter(word => !excluded.has(word));

const call = '[a-zA-Z_][\\w$]*(?=\\s*\\()';

export const ZENTRO_SQL_LANGUAGE: languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: SQL_TOKEN_POSTFIX,
    ignoreCase: true,
    brackets: [{ open: '(', close: ')', token: 'delimiter.parenthesis' }],
    wordOperators,
    types,
    functionNames,
    keywords,
    tokenizer: {
        root: [
            { include: '@comments' },
            [/\s+/, 'white'],
            { include: '@numbers' },
            { include: '@strings' },
            { include: '@quotedIdentifiers' },
            [/::/, { token: 'operator', next: '@castType' }],
            { include: '@variables' },
            [/[;,.]/, 'delimiter'],
            [/[()]/, '@brackets'],
            [/[[\]]/, 'delimiter.parenthesis'],
            // A name followed by "(" may be a function; anything else is not.
            [
                new RegExp(call),
                {
                    cases: {
                        '@wordOperators': 'operator',
                        '@types': 'type',
                        '@functionNames': 'predefined',
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],
            [
                /[a-zA-Z_#][\w$#]*/,
                {
                    cases: {
                        '@wordOperators': 'operator',
                        '@types': 'type',
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                },
            ],
            [/[<>=!%&+\-*/|~^]/, 'operator'],
        ],
        comments: [
            [/--.*/, 'comment'],
            [/\/\*/, { token: 'comment', next: '@comment' }],
        ],
        comment: [
            [/[^*/]+/, 'comment'],
            [/\*\//, { token: 'comment', next: '@pop' }],
            [/[*/]/, 'comment'],
        ],
        numbers: [
            [/0[xX][0-9a-fA-F]+/, 'number'],
            [/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/, 'number'],
        ],
        strings: [[/[nNeEbBxX]?'/, { token: 'string', next: '@string' }]],
        string: [
            [/[^']+/, 'string'],
            [/''/, 'string'],
            [/'/, { token: 'string', next: '@pop' }],
        ],
        // "name", `name` and [name] are one token, delimiters included.
        quotedIdentifiers: [
            [/"(?:[^"\r\n]|"")*"/, 'identifier.quote'],
            [/`(?:[^`\r\n]|``)*`/, 'identifier.quote'],
            [/\[(?:[^\]\r\n]|\]\])*\]/, 'identifier.quote'],
            [/["`]/, 'identifier.quote'],
        ],
        variables: [
            // @ is "@": Monarch reads a literal "@" in a regex as an attribute reference.
            [/@{1,2}[\w$#]+/, 'variable'],
            [/:[a-zA-Z_]\w*/, 'variable'],
            [/\$\d+/, 'variable'],
            [/\?/, 'variable'],
        ],
        castType: [
            [/[ \t]+/, 'white'],
            [/[a-zA-Z_][\w$]*/, { token: 'type', next: '@pop' }],
            [/./, { token: '@rematch', next: '@pop' }],
        ],
    },
};

const installed = new WeakSet<object>();

/**
 * Makes `sql` use the grammar above. Monaco registers its built-in SQL grammar
 * through a lazy factory that only runs when a model asks for tokens and no
 * grammar is registered yet, so installing at app start (before any SQL model
 * exists) means the built-in one never runs. Safe to call repeatedly for the
 * same Monaco instance.
 */
export function installSqlTokenizer(monaco: {
    languages: {
        setMonarchTokensProvider: (id: string, def: languages.IMonarchLanguage) => unknown;
    };
}): void {
    if (installed.has(monaco)) return;
    installed.add(monaco);
    monaco.languages.setMonarchTokensProvider('sql', ZENTRO_SQL_LANGUAGE);
}
