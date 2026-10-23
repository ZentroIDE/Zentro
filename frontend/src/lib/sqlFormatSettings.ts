// SPDX-License-Identifier: GPL-3.0-only

import { utils } from '../../wailsjs/go/models';

export type SqlKeywordCase = 'upper' | 'lower' | 'preserve';
export type SqlCommaPosition = 'trailing' | 'leading';
export type SqlAndOrPosition = 'leading' | 'trailing';

export const SQL_INDENT_SIZES = [2, 4, 8] as const;
export type SqlIndentSize = (typeof SQL_INDENT_SIZES)[number];

export interface SqlFormatSettings {
    keywordCase: SqlKeywordCase;
    indentSize: SqlIndentSize;
    useTabs: boolean;
    commaPosition: SqlCommaPosition;
    andOrPosition: SqlAndOrPosition;
}

export const DEFAULT_SQL_FORMAT: SqlFormatSettings = {
    keywordCase: 'upper',
    indentSize: 2,
    useTabs: false,
    commaPosition: 'trailing',
    andOrPosition: 'leading',
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;
}

/** Turns whatever the backend stored (unset fields on older configs) into a fully resolved value. */
export function normalizeSqlFormat(raw?: Partial<utils.SQLFormatPrefs> | null): SqlFormatSettings {
    const size = Number(raw?.indent_size);
    return {
        keywordCase: pick(raw?.keyword_case, ['upper', 'lower', 'preserve'], 'upper'),
        indentSize: (SQL_INDENT_SIZES as readonly number[]).includes(size)
            ? (size as SqlIndentSize)
            : DEFAULT_SQL_FORMAT.indentSize,
        useTabs: raw?.use_tabs === true,
        commaPosition: pick(raw?.comma_position, ['trailing', 'leading'], 'trailing'),
        andOrPosition: pick(raw?.and_or_position, ['leading', 'trailing'], 'leading'),
    };
}

export function toSqlFormatPrefs(settings: SqlFormatSettings): utils.SQLFormatPrefs {
    return new utils.SQLFormatPrefs({
        keyword_case: settings.keywordCase,
        indent_size: settings.indentSize,
        use_tabs: settings.useTabs,
        comma_position: settings.commaPosition,
        and_or_position: settings.andOrPosition,
    });
}
