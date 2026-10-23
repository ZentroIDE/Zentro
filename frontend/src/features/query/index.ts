// SPDX-License-Identifier: GPL-3.0-only

/**
 * Public query-domain API for modules outside `features/query`.
 *
 * Use this barrel when another feature, app-level hook, or shell component
 * needs query execution utilities without depending on deep import paths.
 */
export {
    applyPreExecuteFilterPolicy,
    getRelatedResultTabIds,
    resolveExecuteQuery,
    resolveExecutionStrategy,
    registerExecutionStrategy,
    EditorExecutionStrategy,
    FilterExecutionStrategy,
} from '../../lib/queryExecutionRouting';
export type {
    QueryExecutionSource,
    ExecutionContext,
    ExecutionStrategy,
} from '../../lib/queryExecutionRouting';

export { resolveQueryPolicy } from '../../lib/writeSafety/policy';
export { resolveResultFetchStrategy } from '../../lib/resultStrategy';
export { classifyQueryFailure } from './runtime';
export type {
    QueryExecutionState,
    QueryFailureCode,
    QueryProgress,
    ExecutionPolicy,
} from './runtime';
export type { QueryPolicy } from '../../lib/writeSafety/policy';
export {
    analyzeSqlRisk,
    analyzeStatementRisk,
    evaluateWriteSafetyDecision,
    buildOperationPreflight,
} from '../../lib/writeSafety/writeSafety';
export { withSchemaContextHint } from '../../lib/schemaErrorHint';
export {
    registerQueryCommandContribution,
    registerResultActionContribution,
    listQueryCommandContributions,
    listResultActionContributions,
} from '../../lib/contributionRegistry';
export type {
    QueryFeatureApi,
    QueryCommandContext,
    QueryCommandContribution,
    ResultActionContext,
    ResultActionContribution,
} from '../../lib/queryContracts';
export type {
    QueryAuditMeta,
    QueryPreflightResult,
    QueryPreflightStatement,
    WritePreviewPage,
    OpenWritePreviewResult,
} from '../../lib/writeSafety/safetyPreflight';
