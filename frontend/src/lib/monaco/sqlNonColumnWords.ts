// SPDX-License-Identifier: GPL-3.0-only

import { DB_TYPES } from '../dbTypes';

// Bare words that can appear in a SELECT without naming a column. Column
// validation only flags a word that is missing from every table, so this list
// exists purely to suppress false alarms: leaving a word out risks a wrong
// warning, adding a word only ever hides one.

const words = (list: string): string[] => list.trim().split(/\s+/);

const KEYWORDS = words(`
    select from where and or not in is null like between exists case when then else end as on
    by group order having limit offset top distinct all any some join inner left right full
    outer cross natural with over partition rows range unbounded preceding following current
    row filter within interval asc desc nulls first last fetch next only ties percent escape
    collate similar to ilike rlike regexp glob match true false unknown default value values
    both leading trailing at zone array grouping sets rollup cube cast convert try_cast
    try_convert extract position substring overlay date time timestamp if ifnull nullif
    coalesce
`);

// Keywords that finish an expression, so a bare word after them is an alias:
// `CASE ... END label`, `x IS NULL flag`.
const KEYWORDS_ENDING_A_VALUE = words(`
    null true false end current_date current_time current_timestamp current_user session_user
    system_user user localtime localtimestamp sysdate rownum
`);

const DATE_PARTS = words(`
    year quarter month week day dayofyear weekday hour minute second millisecond microsecond
    nanosecond epoch dow doy isodow isoyear century decade millennium yy yyyy qq q mm m dy y dd
    d wk ww dw hh mi n ss s ms mcs ns tzoffset iso_week isowk isoww timezone_hour
    timezone_minute
`);

const SYSTEM_COLUMNS = words('rowid _rowid_ oid ctid xmin xmax cmin cmax tableoid');

const COMMON_TYPES = words(`
    integer int text boolean bool json jsonb uuid binary varbinary blob char varchar nvarchar
    decimal numeric float real bigint smallint tinyint money xml signed unsigned double
    precision
`);

const driverTypeWords = Object.values(DB_TYPES)
    .flat()
    .flatMap(type => type.toLowerCase().match(/[a-z_]+/g) ?? []);

const NON_COLUMN_WORDS = new Set<string>([
    ...KEYWORDS,
    ...KEYWORDS_ENDING_A_VALUE,
    ...DATE_PARTS,
    ...SYSTEM_COLUMNS,
    ...COMMON_TYPES,
    ...driverTypeWords,
]);

const VALUE_ENDING_KEYWORDS = new Set<string>(KEYWORDS_ENDING_A_VALUE);

/** True for a bare word that is a keyword, date part, type or system column. */
export function isNonColumnWord(word: string): boolean {
    return NON_COLUMN_WORDS.has(word.toLowerCase());
}

/** True for a keyword that finishes an expression (`... END alias`, `x IS NULL flag`). */
export function isValueEndingKeyword(word: string): boolean {
    return VALUE_ENDING_KEYWORDS.has(word.toLowerCase());
}
