// SPDX-License-Identifier: GPL-3.0-only

import type { languages } from 'monaco-editor';
import { getTypesForDriver } from '../dbTypes';
import {
    COLUMN_LIKE_CLAUSES,
    DRIVER_SQL_KEYWORDS,
    SELECT_LIKE_CLAUSES,
    getSqlFunctionsForDriver,
    SQL_KEYWORDS,
    SQL_OPERATORS,
    TABLE_LIKE_CLAUSES,
} from './sqlCompletionConstants';
import { extractOutputColumnsAtCursor } from './sqlCompletionProjection';
import { collectSigilNames, sigilOf } from './sqlCompletionVariables';
import {
    buildCatalogIndex,
    findPreferredCatalogMatches,
    resolveColumnsForSources,
    resolveSourcesFromIdentifier,
} from './sqlCompletionCatalog';
import {
    generateAliasFromObjectName,
    normalizeDriverKey,
    normalizeIdentifier,
    quoteIdentifierForDriver,
} from './sqlCompletionIdentifiers';
import {
    buildSelectLikeSuggestions,
    finalizeSuggestions,
    isAwaitingAlterTableTarget,
    makeSortText,
    normalizeInsertClause,
} from './sqlCompletionBuilderUtils';
import { buildForeignKeyColumnItems } from './sqlCompletionFkColumns';
import { buildJoinSuggestionItems } from './sqlCompletionJoinSuggestions';
import {
    buildColumnGroups,
    buildColumnReferences,
    qualifyColumn,
} from './sqlCompletionColumnGroups';
import { formatSelectList, type SelectListFormatOptions } from './sqlSelectListFormat';
import type { TableCompletionItem } from './sqlSuggestionTableDocs';
import {
    CompletionKind,
    SqlAnalysis,
    SqlCompletionBuildOptions,
    SqlCompletionEnv,
    SuggestionRecord,
    SqlSourceRef,
} from './sqlCompletionTypes';

const STATEMENT_STARTER_KEYWORDS = new Set([
    'SELECT',
    'INSERT INTO',
    'UPDATE',
    'DELETE FROM',
    'CREATE TABLE',
    'ALTER TABLE',
    'DROP TABLE',
    'CREATE VIEW',
    'DROP VIEW',
    'CREATE INDEX',
    'DROP INDEX',
    'WITH',
    'EXPLAIN',
]);

function resolveUniqueAlias(baseAlias: string, taken: Set<string>): string {
    if (!taken.has(baseAlias)) return baseAlias;
    let suffix = 2;
    while (taken.has(`${baseAlias}${suffix}`)) suffix++;
    return `${baseAlias}${suffix}`;
}

export async function buildSqlCompletionItems(
    analysis: SqlAnalysis,
    currentWord: string,
    range: {
        startLineNumber: number;
        endLineNumber: number;
        startColumn: number;
        endColumn: number;
    },
    env: SqlCompletionEnv,
    options: SqlCompletionBuildOptions = {},
): Promise<languages.CompletionItem[]> {
    const shouldAbort = options.shouldAbort ?? (() => false);
    if (analysis.isInCommentOrString || shouldAbort()) return [];

    const suggestionMap = new Map<string, SuggestionRecord>();
    // When the user is already inside an open quote ("[Phone N|]") the item
    // must replace the whole quoted span, and Monaco fuzzy-matches the text
    // from that widened range's start against filterText — so the opener has
    // to lead the filter text or every item would be filtered out.
    const identifierPlacement = (label: string) =>
        options.quotedIdentifier
            ? {
                  range: options.quotedIdentifier.range,
                  filterText: `${options.quotedIdentifier.opener}${label}`,
              }
            : { range };
    const currentWordNorm = normalizeIdentifier(currentWord);
    const currentWordLower = currentWordNorm.toLowerCase();
    const resolvePrefixBoost = (label: string, kind?: CompletionKind): number => {
        const labelNorm = normalizeIdentifier(label).toLowerCase();
        const keywordKind = env.monaco.languages.CompletionItemKind.Keyword as CompletionKind;
        const functionKind = env.monaco.languages.CompletionItemKind.Function as CompletionKind;
        const fieldKind = env.monaco.languages.CompletionItemKind.Field as CompletionKind;
        const moduleKind = env.monaco.languages.CompletionItemKind.Module as CompletionKind;
        const classKind = env.monaco.languages.CompletionItemKind.Class as CompletionKind;
        const textKind = env.monaco.languages.CompletionItemKind.Text as CompletionKind;
        const snippetKind = env.monaco.languages.CompletionItemKind.Snippet as CompletionKind;
        const operatorKind = env.monaco.languages.CompletionItemKind.Operator as CompletionKind;
        // "c.Phone No_" is matched by what the user types for the column, so
        // an alias-qualified field also counts as a prefix hit on its column part.
        const columnPart =
            kind === fieldKind && labelNorm.includes('.')
                ? labelNorm.slice(labelNorm.lastIndexOf('.') + 1)
                : labelNorm;
        const prefixMatch =
            Boolean(currentWordLower) &&
            (labelNorm.startsWith(currentWordLower) || columnPart.startsWith(currentWordLower));
        if (prefixMatch) {
            if (kind === moduleKind || kind === classKind) return -1200;
            if (kind === keywordKind) return -1000;
            if (kind === functionKind) return -900;
            if (kind === fieldKind) return -800;
            if (kind === operatorKind) return -600;
            if (kind === snippetKind) return -500;
            if (kind === textKind) return -400;
            return -300;
        }
        if (kind === textKind) return 250;
        if (kind === snippetKind) return 150;
        if (kind === operatorKind) return 120;
        if (kind === moduleKind || kind === classKind) return -150;
        if (kind === fieldKind) return 90;
        if (kind === functionKind) return 70;
        return 0;
    };
    const resolveLabel = (label: languages.CompletionItem['label']): string => {
        if (typeof label === 'string') return label;
        return label?.label || '';
    };
    const applyStatementTerminatorForUnknownClause = (
        items: languages.CompletionItem[],
    ): languages.CompletionItem[] => {
        return items;
    };
    const clause = normalizeInsertClause(analysis);
    const baseClause = clause === 'insertColumns' ? 'select' : clause;
    const awaitingAlterTableTarget = isAwaitingAlterTableTarget(analysis);
    const sqlFunctions = getSqlFunctionsForDriver(normalizeDriverKey(env.driver));

    const addSuggestion = (label: string, item: languages.CompletionItem, priority: number) => {
        const key = normalizeIdentifier(label);
        const resolvedPriority = priority + resolvePrefixBoost(label, item.kind as CompletionKind);
        const existing = suggestionMap.get(key);
        if (!existing || resolvedPriority < existing.priority) {
            suggestionMap.set(key, {
                priority: resolvedPriority,
                item: { ...item, sortText: makeSortText(resolvedPriority, label) },
            });
        }
    };
    const addKeyword = (label: string, insertText = `${label} `, priority = 200) =>
        addSuggestion(
            label,
            {
                label,
                kind: env.monaco.languages.CompletionItemKind.Keyword as CompletionKind,
                insertText,
                range,
                // insertText already bakes in the trailing space, so Monaco's
                // default acceptSuggestionOnCommitCharacter would "accept" this
                // item when the user presses Space — replacing identical text
                // and swallowing the keystroke instead of inserting a literal
                // space. Suppress commit-on-punctuation for keywords; Tab/Enter
                // still accepts normally.
                commitCharacters: [],
            },
            priority,
        );
    const addFunction = (label: string, snippet = `${label}($1)`, priority = 200) =>
        addSuggestion(
            label,
            {
                label,
                kind: env.monaco.languages.CompletionItemKind.Function as CompletionKind,
                insertText: snippet,
                insertTextRules: env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
            },
            priority,
        );
    const addOperator = (label: string, insertText = label, priority = 50) =>
        addSuggestion(
            label,
            {
                label,
                kind: env.monaco.languages.CompletionItemKind.Operator as CompletionKind,
                insertText,
                range,
            },
            priority,
        );
    const addText = (label: string, insertText = label, priority = 500) =>
        addSuggestion(
            label,
            {
                label,
                kind: env.monaco.languages.CompletionItemKind.Text as CompletionKind,
                insertText,
                range,
            },
            priority,
        );

    // `@var` / `#temp`: the range already covers the sigil (see the provider), so
    // offer only what the script mentions instead of the whole keyword list.
    const sigil = sigilOf(currentWord);
    if (sigil) {
        collectSigilNames(analysis.fullText, sigil, analysis.cursorOffset, currentWord).forEach(
            name =>
                addSuggestion(
                    name,
                    {
                        label: name,
                        kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
                        insertText: name,
                        detail: sigil === '@' ? 'variable' : 'temp table',
                        range,
                    },
                    0,
                ),
        );
        return finalizeSuggestions(suggestionMap);
    }
    const addTemplates = () =>
        env.templates.forEach(template => {
            addSuggestion(
                template.trigger,
                {
                    label: template.trigger,
                    kind: env.monaco.languages.CompletionItemKind.Snippet as CompletionKind,
                    detail: template.name,
                    documentation: template.content,
                    insertText: template.content,
                    insertTextRules:
                        env.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                },
                240,
            );
        });
    const addBaselineKeywords = () => {
        SQL_KEYWORDS.forEach(keyword => addKeyword(keyword, keyword, 260));
        const driverKey = normalizeDriverKey(env.driver);
        (DRIVER_SQL_KEYWORDS[driverKey] || []).forEach(keyword =>
            addKeyword(keyword, keyword, 255),
        );
    };

    const inferSourceSchemaName = (source: SqlSourceRef): string => {
        if (source.schemaName) return normalizeIdentifier(source.schemaName);
        if (!(source.kind === 'table' || source.kind === 'view')) return '';
        const matches = findPreferredCatalogMatches(
            env.schemas,
            source.name,
            undefined,
            env.currentSchema,
        );
        if (matches.length === 0) return '';
        const preferredKind = source.kind === 'view' ? 'view' : 'table';
        const preferredMatches = matches.filter(match => match.kind === preferredKind);
        if (preferredMatches.length === 1)
            return normalizeIdentifier(preferredMatches[0].schemaName);
        if (preferredMatches.length === 0 && matches.length === 1)
            return normalizeIdentifier(matches[0].schemaName);
        return '';
    };

    const statementSchemaContext = (() => {
        const schemas = new Set<string>();
        analysis.sources.forEach(source => {
            const inferred = inferSourceSchemaName(source);
            if (inferred) schemas.add(inferred);
        });
        return schemas;
    })();
    const currentSchemaFromState = normalizeIdentifier(env.currentSchema || '');
    const effectiveContextSchema =
        statementSchemaContext.size === 1
            ? Array.from(statementSchemaContext)[0]
            : statementSchemaContext.size === 0
              ? currentSchemaFromState
              : '';

    const shouldAppendTerminatorForInitialSelectFrom = (() => {
        if (baseClause !== 'from') return false;
        const normalized = analysis.statementText.trim().replace(/\s+/g, ' ').toLowerCase();
        return normalized.startsWith('select * from ');
    })();

    const SYSTEM_SCHEMAS = new Set([
        'information_schema',
        'pg_catalog',
        'pg_toast',
        'sys',
        'mysql',
        'performance_schema',
    ]);

    const buildTableItems = (options?: { withAlias?: boolean; appendTerminator?: boolean }) => {
        const catalog = buildCatalogIndex(env.schemas);
        const items: Array<{ item: TableCompletionItem; priority: number }> = [];
        const currentSchemaNorm = normalizeIdentifier(env.currentSchema || '');
        // Aliases already claimed in this statement. The token being typed
        // ("FROM c|") is a source too, but not one that owns an alias yet.
        const takenAliases = new Set(
            analysis.sources
                .filter(
                    source => source.alias || normalizeIdentifier(source.name) !== currentWordNorm,
                )
                .map(source => normalizeIdentifier(source.alias || source.name))
                .filter(Boolean),
        );
        for (const entry of catalog.entries) {
            const label =
                entry.duplicateCount > 1 ? `${entry.schemaName}.${entry.name}` : entry.name;
            const detail = `${entry.kind === 'view' ? 'View' : 'Table'} - ${entry.schemaName}`;
            const entrySchema = normalizeIdentifier(entry.schemaName);
            const forceQualifiedBySchema =
                entry.duplicateCount > 1 &&
                (!effectiveContextSchema || effectiveContextSchema !== entrySchema);
            const qualifiedName = forceQualifiedBySchema
                ? `${quoteIdentifierForDriver(entry.schemaName, env.driver, true)}.${quoteIdentifierForDriver(entry.name, env.driver, true)}`
                : quoteIdentifierForDriver(entry.name, env.driver);
            const alias = options?.withAlias
                ? resolveUniqueAlias(generateAliasFromObjectName(entry.name), takenAliases)
                : '';
            const insertTextBase = alias ? `${qualifiedName} ${alias}` : qualifiedName;
            const insertText = options?.appendTerminator ? `${insertTextBase};` : insertTextBase;

            let priority = 60;
            if (entrySchema === currentSchemaNorm) {
                priority = 20;
            } else if (SYSTEM_SCHEMAS.has(entry.schemaName.toLowerCase())) {
                priority = 150;
            }

            items.push({
                priority,
                item: {
                    label,
                    kind:
                        entry.kind === 'view'
                            ? (env.monaco.languages.CompletionItemKind.Class as CompletionKind)
                            : (env.monaco.languages.CompletionItemKind.Module as CompletionKind),
                    detail,
                    insertText,
                    ...identifierPlacement(label),
                    __zentroTableMeta: {
                        schemaName: entry.schemaName,
                        tableName: entry.name,
                        objectKind: entry.kind,
                        profileKey: env.profileKey || '',
                        dbName: env.dbName || '',
                        driver: env.driver || '',
                    },
                },
            });
        }
        return items;
    };

    const buildColumnItems = async (sources: SqlSourceRef[]) => {
        const resolvedColumns = await resolveColumnsForSources(sources, analysis, env, shouldAbort);
        if (shouldAbort()) return [];
        return resolvedColumns.map(column => ({
            label: column.Name,
            kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
            detail: column.DataType || column.detail || '',
            insertText: quoteIdentifierForDriver(column.Name, env.driver),
            ...identifierPlacement(column.Name),
        }));
    };

    const buildAliasItems = (sources: SqlSourceRef[]) => {
        const uniqueAliases = new Set<string>();
        const items: Array<{
            label: string;
            kind: CompletionKind;
            detail: string;
            insertText: string;
            range: typeof range;
            filterText?: string;
        }> = [];

        sources.slice(0, 8).forEach(source => {
            const alias = (source.alias || source.name || '').trim();
            if (!alias) return;
            const key = normalizeIdentifier(alias);
            if (!key || uniqueAliases.has(key)) return;
            uniqueAliases.add(key);
            items.push({
                label: alias,
                kind: env.monaco.languages.CompletionItemKind.Text as CompletionKind,
                detail: 'Alias',
                insertText: `${quoteIdentifierForDriver(alias, env.driver)}.`,
                ...identifierPlacement(alias),
            });
        });

        return items;
    };

    const qualifiedInsert = (alias: string, columnName: string) =>
        qualifyColumn(alias, columnName, env.driver);

    // "nvarchar - c (Customer)": the qualifier a user sees in the query plus
    // the real table behind it, so two joined tables stay distinguishable
    // even when their aliases are terse.
    const describeQualifiedColumn = (source: SqlSourceRef, alias: string, dataType?: string) => {
        const base = dataType ? `${dataType} - ${alias}` : `Column - ${alias}`;
        const tableName = source.name.trim();
        return tableName && normalizeIdentifier(tableName) !== normalizeIdentifier(alias)
            ? `${base} (${tableName})`
            : base;
    };

    const buildAliasQualifiedColumnItems = async (sources: SqlSourceRef[]) => {
        const unique = new Map<
            string,
            {
                label: string;
                kind: CompletionKind;
                detail: string;
                insertText: string;
                range: typeof range;
                filterText?: string;
            }
        >();
        const targetSources = sources.slice(0, 8);

        for (const source of targetSources) {
            if (shouldAbort()) return [];
            const alias = (source.alias || source.name || '').trim();
            if (!alias) continue;
            const aliasNorm = normalizeIdentifier(alias);
            if (!aliasNorm) continue;

            if (source.columns && source.columns.length > 0) {
                source.columns.forEach(columnName => {
                    const label = `${alias}.${columnName}`;
                    const key = normalizeIdentifier(label);
                    if (!unique.has(key)) {
                        unique.set(key, {
                            label,
                            kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
                            detail: describeQualifiedColumn(source, alias),
                            insertText: qualifiedInsert(alias, columnName),
                            ...identifierPlacement(label),
                        });
                    }
                });
                continue;
            }

            if (source.kind === 'cte' || source.kind === 'subquery') continue;
            const matches = findPreferredCatalogMatches(
                env.schemas,
                source.name,
                source.schemaName,
                env.currentSchema,
            );
            for (const match of matches) {
                if (shouldAbort()) return [];
                const columns = await env.fetchColumns(match.schemaName, match.name);
                if (shouldAbort()) return [];
                columns.forEach(column => {
                    const label = `${alias}.${column.Name}`;
                    const key = normalizeIdentifier(label);
                    if (!unique.has(key)) {
                        unique.set(key, {
                            label,
                            kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
                            detail: describeQualifiedColumn(source, alias, column.DataType),
                            insertText: qualifiedInsert(alias, column.Name),
                            ...identifierPlacement(label),
                        });
                    }
                });
            }
        }

        return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
    };

    // Bare column names are ambiguous once a statement reads from several
    // sources (both tables have "id"), and collapsing them by name would hide
    // one table's column entirely. With two or more sources every column is
    // offered once per source, qualified with that source's alias.
    const buildScopedColumnItems = async (sources: SqlSourceRef[]) =>
        new Set(sources.map(source => normalizeIdentifier(source.alias || source.name))).size > 1
            ? buildAliasQualifiedColumnItems(sources)
            : buildColumnItems(sources);

    // Below every real column and keyword hit, above everything else: these
    // are the "give me the data now" shortcuts, so they lead the list when the
    // user has typed nothing yet, and win outright once "all" is typed.
    const EXPANSION_PRIORITY = -140;

    const addAllColumnsItem = (
        parts: string[],
        detail: string,
        layout: Pick<SelectListFormatOptions, 'firstColumnInline'> = {},
    ) => {
        const insertText = formatSelectList(parts, { ...layout, lineIndent: options.lineIndent });
        addSuggestion(
            'All columns',
            {
                label: 'All columns',
                kind: env.monaco.languages.CompletionItemKind.Snippet as CompletionKind,
                detail,
                documentation: { value: `\`\`\`sql\n${insertText}\n\`\`\`` },
                insertText,
                range,
            },
            EXPANSION_PRIORITY,
        );
    };

    // "SELECT |" over a FROM clause: `All columns` expands every column of
    // every joined source (alias-qualified once there is more than one), and
    // each source gets a `alias.*` shortcut.
    const addSelectListExpansions = async (clauseKind: string) => {
        if (options.quotedIdentifier) return;
        const groups = await buildColumnGroups(analysis.sources, env, shouldAbort);
        if (shouldAbort() || groups.length === 0) return;
        const qualify = groups.length > 1;
        const parts = buildColumnReferences(groups, env.driver);
        if (parts.length > 1) {
            addAllColumnsItem(
                parts,
                qualify
                    ? `${parts.length} columns from ${groups.length} tables`
                    : `${parts.length} columns`,
            );
        }
        if (!qualify || clauseKind === 'insertColumns') return;
        groups.forEach(group => {
            const label = `${group.qualifier}.*`;
            addSuggestion(
                label,
                {
                    label,
                    kind: env.monaco.languages.CompletionItemKind.Snippet as CompletionKind,
                    detail: `All columns of ${group.source.name} (${group.columns.length})`,
                    insertText: `${quoteIdentifierForDriver(group.qualifier, env.driver)}.*`,
                    range,
                },
                EXPANSION_PRIORITY + 2,
            );
        });
    };

    // Columns of tables one foreign key away, together with the JOIN they need.
    const addForeignKeyColumns = async () => {
        if (options.quotedIdentifier || !options.positionAt) return;
        const records = await buildForeignKeyColumnItems({
            analysis,
            currentWord,
            range,
            env,
            positionAt: options.positionAt,
            shouldAbort,
        });
        if (shouldAbort()) return;
        records.forEach(record => addSuggestion(record.label, record.item, record.priority));
    };

    addBaselineKeywords();
    if (shouldAbort()) return [];
    if (env.schemas.length === 0) {
        addTemplates();
        if (shouldAbort()) return [];
        return applyStatementTerminatorForUnknownClause(finalizeSuggestions(suggestionMap));
    }

    if (analysis.afterDot) {
        const dotSources = resolveSourcesFromIdentifier(
            analysis.dotIdentifier,
            analysis.sources,
            analysis.ctes,
            env.schemas,
        );
        const columns = await buildColumnItems(
            dotSources.length > 0 ? dotSources : analysis.sources,
        );
        if (shouldAbort()) return [];
        columns.forEach(item => addSuggestion(item.label as string, item, 0));
        // "SELECT c.|": `*` and the expanded column list of that one source.
        if (baseClause === 'select' && clause !== 'insertColumns' && dotSources.length === 1) {
            const [group] = await buildColumnGroups(dotSources, env, shouldAbort);
            if (shouldAbort()) return [];
            if (group) {
                addSuggestion(
                    '*',
                    {
                        label: '*',
                        kind: env.monaco.languages.CompletionItemKind.Snippet as CompletionKind,
                        detail: `All columns of ${group.source.name} (${group.columns.length})`,
                        insertText: '*',
                        range,
                    },
                    EXPANSION_PRIORITY + 2,
                );
                if (group.columns.length > 1 && !options.quotedIdentifier) {
                    // The "c." is already typed, so only the follow-on columns repeat it.
                    addAllColumnsItem(
                        group.columns.map((column, index) =>
                            index === 0
                                ? quoteIdentifierForDriver(column, env.driver)
                                : qualifiedInsert(group.qualifier, column),
                        ),
                        `${group.columns.length} columns`,
                        { firstColumnInline: true },
                    );
                }
            }
        }
        return finalizeSuggestions(suggestionMap);
    }

    if (COLUMN_LIKE_CLAUSES.has(baseClause)) {
        const isFilteringClause =
            baseClause === 'where' ||
            baseClause === 'having' ||
            baseClause === 'on' ||
            baseClause === 'set';
        const bareColumnSources = isFilteringClause
            ? analysis.sources.filter(s => !s.alias)
            : analysis.sources;
        const columns = await buildScopedColumnItems(bareColumnSources);
        if (shouldAbort()) return [];
        columns.forEach(item => addSuggestion(item.label as string, item, 0));
    }
    if (SELECT_LIKE_CLAUSES.has(baseClause) || baseClause === 'with' || baseClause === 'unknown') {
        const columns =
            analysis.sources.length > 0 ? await buildScopedColumnItems(analysis.sources) : [];
        if (shouldAbort()) return [];
        columns.forEach(item => addSuggestion(item.label as string, item, 0));
        if (baseClause === 'select') {
            await addSelectListExpansions(clause);
            if (clause !== 'insertColumns') await addForeignKeyColumns();
        }
        if (shouldAbort()) return [];
        addTemplates();
        buildSelectLikeSuggestions(addKeyword, addFunction, addText, addOperator, sqlFunctions);
        addText('*', '*', 10);
        addKeyword('DISTINCT', 'DISTINCT ', 15);
        addKeyword('FROM', 'FROM ', 20);
    }
    if (TABLE_LIKE_CLAUSES.has(baseClause) || awaitingAlterTableTarget) {
        const withAlias = baseClause === 'from' || baseClause === 'join';
        buildTableItems({
            withAlias,
            appendTerminator: shouldAppendTerminatorForInitialSelectFrom,
        }).forEach(record =>
            addSuggestion(record.item.label as string, record.item, record.priority),
        );
        if (!awaitingAlterTableTarget) addKeyword('AS', 'AS ', 130);
        if (baseClause === 'insert') {
            addKeyword('VALUES', 'VALUES ', 120);
            addKeyword('DEFAULT VALUES', 'DEFAULT VALUES', 110);
        }
        if (baseClause === 'delete') addKeyword('WHERE', 'WHERE ', 140);
    }
    if (baseClause === 'from' || baseClause === 'join' || baseClause === 'on') {
        const joinSuggestions = await buildJoinSuggestionItems(
            analysis,
            baseClause,
            currentWord,
            range,
            env,
            shouldAbort,
        );
        if (shouldAbort()) return [];
        joinSuggestions.forEach(record =>
            addSuggestion(record.label, record.item, record.priority),
        );
    }
    if (
        baseClause === 'where' ||
        baseClause === 'having' ||
        baseClause === 'on' ||
        baseClause === 'set'
    ) {
        const unaliasedSources = analysis.sources.filter(s => !s.alias);
        const columns = await buildScopedColumnItems(unaliasedSources);
        if (shouldAbort()) return [];
        const aliases = buildAliasItems(analysis.sources);
        const aliasColumns = await buildAliasQualifiedColumnItems(analysis.sources);
        if (shouldAbort()) return [];
        columns.forEach(item => addSuggestion(item.label as string, item, 0));
        aliases.forEach(item => addSuggestion(item.label, item, -25));
        aliasColumns.forEach(item => addSuggestion(item.label, item, -10));
        SQL_OPERATORS.forEach(op => addOperator(op, `${op} `, 50));
        buildSelectLikeSuggestions(addKeyword, addFunction, addText, addOperator, sqlFunctions);
    }
    if (baseClause === 'groupBy' || baseClause === 'orderBy') {
        const columns = await buildScopedColumnItems(analysis.sources);
        if (shouldAbort()) return [];
        columns.forEach(item => addSuggestion(item.label as string, item, 0));
        // A select-list alias is a valid ORDER BY / GROUP BY reference.
        extractOutputColumnsAtCursor(
            analysis.fullText.slice(analysis.statementStartOffset, analysis.statementEndOffset),
            analysis.cursorOffset - analysis.statementStartOffset,
            analysis.cursorDepth,
        ).forEach(name =>
            addSuggestion(
                name,
                {
                    label: name,
                    kind: env.monaco.languages.CompletionItemKind.Field as CompletionKind,
                    insertText: name,
                    detail: 'select-list column',
                    range,
                },
                -30,
            ),
        );
        sqlFunctions.forEach(fn => addFunction(fn, `${fn}($1)`, 100));
        addKeyword('ASC', 'ASC ', 20);
        addKeyword('DESC', 'DESC ', 20);
    }
    if (
        baseClause === 'createTable' ||
        (baseClause === 'alterTable' && !awaitingAlterTableTarget)
    ) {
        const types = getTypesForDriver(env.driver);
        types.forEach(type =>
            addSuggestion(
                type,
                {
                    label: type,
                    kind: env.monaco.languages.CompletionItemKind.Keyword as CompletionKind,
                    insertText: type,
                    range,
                },
                0,
            ),
        );
        [
            'PRIMARY KEY',
            'FOREIGN KEY',
            'NOT NULL',
            'DEFAULT',
            'UNIQUE',
            'CHECK',
            'REFERENCES',
        ].forEach(kw => addKeyword(kw, kw, 100));
        if (baseClause === 'alterTable')
            ['ADD COLUMN', 'DROP COLUMN', 'RENAME COLUMN', 'ALTER COLUMN'].forEach(kw =>
                addKeyword(kw, kw, 90),
            );
    }
    if (baseClause === 'values') {
        ['NULL', 'DEFAULT', 'CURRENT_TIMESTAMP'].forEach(kw => addKeyword(kw, `${kw} `, 80));
        ['TRUE', 'FALSE'].forEach(kw => addKeyword(kw, kw, 90));
        sqlFunctions.forEach(fn => addFunction(fn, `${fn}($1)`, 120));
    }
    if (baseClause === 'select' && analysis.sources.length === 0)
        buildTableItems().forEach(record =>
            addSuggestion(record.item.label as string, record.item, record.priority + 40),
        );
    if (baseClause === 'unknown') addTemplates();
    if (shouldAbort()) return [];
    return applyStatementTerminatorForUnknownClause(finalizeSuggestions(suggestionMap));
}
