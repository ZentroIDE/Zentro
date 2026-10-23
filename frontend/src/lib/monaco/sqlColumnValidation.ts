// SPDX-License-Identifier: GPL-3.0-only

import { analyzeSqlText } from './sqlCompletionAnalysis';
import {
    buildColumnGroups,
    type ColumnGroupEnv,
    type SourceColumnGroup,
} from './sqlCompletionColumnGroups';
import { normalizeIdentifier } from './sqlCompletionIdentifiers';
import { collectColumnReferences, type ColumnReference } from './sqlColumnReferences';
import { suggestColumnNames, type ColumnSuggestion } from './sqlColumnSuggestions';
import { splitSqlStatements, type StatementSlice } from './sqlSchemaWarnings';

// Checks the columns a SELECT names against the tables it reads: columns that
// do not exist, and bare columns that exist in several joined tables (which
// the database rejects as ambiguous). It stays silent whenever it cannot be
// sure: statement shapes the reference scanner does not read, sources that
// are not plain catalog tables, columns that could not be loaded.

/** A catalog table, as named by the schema tree. */
export type ColumnTableRef = { schemaName: string; name: string };

export type ColumnWarningKind = 'unknown' | 'ambiguous';

export interface SqlColumnWarning {
    kind: ColumnWarningKind;
    /** A missing column may just be new, so it is a warning; an ambiguous one always fails. */
    severity: 'error' | 'warning';
    /** Name as written, without quotes. */
    columnName: string;
    qualifier?: string;
    /** Whether the column was written inside quotes/brackets. */
    quoted: boolean;
    /** Offsets of the column token within the whole editor text. */
    startOffset: number;
    endOffset: number;
    /** Full text for hover and the Problems list. */
    message: string;
    /** One line for showing at the end of the code line. */
    shortMessage: string;
    /** Unknown column: existing columns it may stand for, best first. */
    suggestions: string[];
    /** Ambiguous column: the qualifiers (aliases) of the tables that contain it. */
    qualifiers: string[];
    /** Tables whose columns to re-read when the column may simply be new. */
    tables: ColumnTableRef[];
}

export type ColumnValidationEnv = ColumnGroupEnv & { driver: string };

const REFRESH_HINT = ' If it was added recently, refresh the table columns (Ctrl+.).';
// The database resolves a bare name in these clauses against the SELECT list
// first, so "ORDER BY order_id" is fine when the SELECT lists an order_id.
const OUTPUT_NAME_CLAUSES = new Set(['group', 'having', 'order']);

const isCatalogRelation = (kind: string): boolean => kind === 'table' || kind === 'view';

const sameName = (left: string, right: string): boolean =>
    normalizeIdentifier(left) === normalizeIdentifier(right);

/** Every source of the statement as a catalog table with loaded columns, else null. */
async function resolveStatementGroups(
    statementText: string,
    env: ColumnValidationEnv,
    shouldAbort: () => boolean,
): Promise<SourceColumnGroup[] | null> {
    const { sources } = analyzeSqlText(statementText, statementText.length);
    if (sources.length === 0 || sources.some(source => !isCatalogRelation(source.kind))) {
        return null;
    }
    try {
        const groups = await buildColumnGroups(sources, env, shouldAbort);
        return groups.length === sources.length && !shouldAbort() ? groups : null;
    } catch {
        // Columns could not be loaded (connection hiccup): say nothing.
        return null;
    }
}

// --- Unknown columns --------------------------------------------------------

function describeSuggestions(suggestions: ColumnSuggestion[]): string {
    if (suggestions.length === 0) return '';
    if (suggestions[0].match === 'similar') return ` Did you mean "${suggestions[0].name}"?`;
    return ` Matching columns: ${suggestions.map(suggestion => suggestion.name).join(', ')}.`;
}

/** Columns of `scope` that the SELECT list does not already contain. */
function findUnselectedColumns(
    scope: SourceColumnGroup[],
    selectList: ColumnReference[],
): string[] {
    return scope.flatMap(group =>
        group.columns.filter(
            column =>
                !selectList.some(
                    reference =>
                        sameName(reference.name, column) &&
                        (!reference.qualifier || sameName(reference.qualifier, group.qualifier)),
                ),
        ),
    );
}

interface WarningSite {
    reference: ColumnReference;
    statementStart: number;
}

function locate({ reference, statementStart }: WarningSite) {
    return {
        columnName: reference.name,
        qualifier: reference.qualifier,
        quoted: reference.quoted,
        startOffset: statementStart + reference.startOffset,
        endOffset: statementStart + reference.endOffset,
    };
}

function buildUnknownWarning(
    site: WarningSite,
    scope: SourceColumnGroup[],
    selectList: ColumnReference[],
): SqlColumnWarning {
    const { reference } = site;
    // A column the SELECT already lists would only duplicate it.
    const suggestions = suggestColumnNames(
        reference.name,
        findUnselectedColumns(scope, selectList),
    );
    const where = reference.qualifier ? `"${scope[0].source.name}"` : 'any table in this query';
    const didYouMean =
        suggestions[0]?.match === 'similar' ? `, did you mean "${suggestions[0].name}"?` : '';
    return {
        ...locate(site),
        kind: 'unknown',
        severity: 'warning',
        message: `Column "${reference.name}" was not found in ${where}.${describeSuggestions(suggestions)}${REFRESH_HINT}`,
        shortMessage: `Column "${reference.name}" not found${didYouMean}`,
        suggestions: suggestions.map(suggestion => suggestion.name),
        qualifiers: [],
        tables: scope.flatMap(group => (group.table ? [group.table] : [])),
    };
}

// --- Ambiguous columns ------------------------------------------------------

function describeOwner(group: SourceColumnGroup): string {
    const name = group.source.name;
    return sameName(name, group.qualifier) ? name : `${name} (${group.qualifier})`;
}

function buildAmbiguousWarning(site: WarningSite, owners: SourceColumnGroup[]): SqlColumnWarning {
    const { reference } = site;
    const list = owners.map(describeOwner).join(', ');
    return {
        ...locate(site),
        kind: 'ambiguous',
        severity: 'error',
        message: `Column reference "${reference.name}" is ambiguous: it exists in ${list}. Qualify it with a table alias, for example ${owners[0].qualifier}.${reference.name}.`,
        shortMessage: `Column "${reference.name}" is ambiguous: ${list}`,
        suggestions: [],
        qualifiers: owners.map(group => group.qualifier),
        tables: [],
    };
}

function isResolvedFromSelectList(
    reference: ColumnReference,
    selectList: ColumnReference[],
): boolean {
    return (
        OUTPUT_NAME_CLAUSES.has(reference.clause) &&
        selectList.some(selected => sameName(selected.name, reference.name))
    );
}

// --- Statement --------------------------------------------------------------

function toWarning(
    site: WarningSite,
    groups: SourceColumnGroup[],
    selectList: ColumnReference[],
): SqlColumnWarning[] {
    const { reference } = site;
    const scope = reference.qualifier
        ? groups.filter(group => sameName(group.qualifier, reference.qualifier ?? ''))
        : groups;
    // A qualifier that is no source (schema-qualified, typo) is not ours to judge.
    if (scope.length === 0) return [];

    const owners = scope.filter(group =>
        group.columns.some(column => sameName(column, reference.name)),
    );
    if (owners.length === 0) return [buildUnknownWarning(site, scope, selectList)];
    const ambiguous =
        !reference.qualifier &&
        owners.length > 1 &&
        !isResolvedFromSelectList(reference, selectList);
    return ambiguous ? [buildAmbiguousWarning(site, owners)] : [];
}

async function validateStatement(
    statement: StatementSlice,
    env: ColumnValidationEnv,
    shouldAbort: () => boolean,
): Promise<SqlColumnWarning[]> {
    const references = collectColumnReferences(statement.text, env.driver);
    if (!references || references.length === 0) return [];
    const groups = await resolveStatementGroups(statement.text, env, shouldAbort);
    if (!groups) return [];
    const selectList = references.filter(reference => reference.clause === 'select');
    return references.flatMap(reference =>
        toWarning({ reference, statementStart: statement.startOffset }, groups, selectList),
    );
}

export async function findUnknownColumns(
    sqlText: string,
    env: ColumnValidationEnv,
    shouldAbort: () => boolean = () => false,
): Promise<SqlColumnWarning[]> {
    const warnings: SqlColumnWarning[] = [];
    for (const statement of splitSqlStatements(sqlText)) {
        if (shouldAbort()) return [];
        warnings.push(...(await validateStatement(statement, env, shouldAbort)));
    }
    return shouldAbort() ? [] : warnings;
}
