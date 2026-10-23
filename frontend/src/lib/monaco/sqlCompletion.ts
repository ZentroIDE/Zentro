// SPDX-License-Identifier: GPL-3.0-only

export {
    analyzeSqlText,
    buildSqlCompletionItems,
    getSchemasForActiveDatabase,
    registerContextAwareSQLCompletion,
    disposeSqlCompletionProviders,
    normalizeDriverKey,
    registerSqlDriverFacade,
    resolveSqlDriverFacade,
    formatTableSuggestionDocumentation,
    isTableCompletionItem,
    resolveTableSuggestionItem,
} from './sqlCompletionEngine';

export type {
    SqlClause,
    SqlToken,
    SqlColumnLike,
    SqlCatalogSchema,
    SqlTemplateLike,
    SqlSourceRef,
    SqlAnalysis,
    SqlCompletionEnv,
    SqlCompletionBuildOptions,
} from './sqlCompletionEngine';

export {
    buildCompletionPlan,
    createEmptyCompletionMemory,
    normalizeCompletionMemory,
    recordCompletionAcceptance,
} from './sqlCompletionEngine';
export type {
    SqlCompletionCandidate,
    SqlCompletionEditorFlavor,
    SqlCompletionRanking,
    SqlCompletionRequest,
    SqlCompletionResult,
    SqlCompletionServices,
    SqlCompletionAcceptance,
    SqlCompletionMemory,
    SqlCompletionMemoryEntry,
    SqlCompletionSuggestionKind,
} from './sqlCompletionEngine';
