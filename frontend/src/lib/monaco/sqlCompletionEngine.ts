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
} from './sqlCompletionCore';

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
} from './sqlCompletionCore';

export { buildCompletionPlan } from './sqlCompletionEngineCore';
export type {
    SqlCompletionCandidate,
    SqlCompletionEditorFlavor,
    SqlCompletionRanking,
    SqlCompletionRequest,
    SqlCompletionResult,
    SqlCompletionServices,
} from './sqlCompletionEngineCore';
export {
    createEmptyCompletionMemory,
    normalizeCompletionMemory,
    recordCompletionAcceptance,
} from './sqlCompletionMemory';
export type {
    SqlCompletionAcceptance,
    SqlCompletionMemory,
    SqlCompletionMemoryEntry,
    SqlCompletionSuggestionKind,
} from './sqlCompletionMemory';
