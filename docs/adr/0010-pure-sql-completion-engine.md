# ADR-0010 - Pure SQL completion engine

- **Status**: accepted
- **Date**: 2026-07-24
- **Decision drivers**: shared completion behavior, stable latency, testable ranking, project-scoped learning

## Context

SQL completion behavior was split between the main Monaco provider, the result-filter provider, direct Zustand reads, and a large candidate builder. This made ranking changes require several touch points and allowed async results or editor-specific context to diverge.

## Decision

Use Ports and Adapters as the primary pattern: a pure TypeScript completion engine owns analysis, candidate planning, ranking, and bounded adaptive boosts; an editor-domain orchestrator supplies state and async schema services; Monaco adapters own registration, cancellation, item conversion, and acceptance commands.

Accepted suggestions are persisted in a versioned project field. Unsupported memory versions fall back to empty state, entries are capped, and memory contributes a bounded boost rather than overriding semantic relevance.

## Alternatives considered

- **Keep provider-owned logic** - smallest code change, but leaves two consumers and five store dependencies coupled to ranking behavior.
- **Create a shared Zustand completion store** - centralizes state but makes deterministic engine tests and result-filter reuse depend on React infrastructure.
- **Replace the existing SQL generators immediately** - gives a fully new implementation, but discards mature alias, schema, quoting, and relationship behavior with high regression risk.
- **Chosen: Ports and Adapters** - reduces expected ranking changes from provider, filter, and store touch points to one engine module while preserving tested generators behind the new boundary.

## Consequences

- **Positive** - main and filter editors share one request/result contract, ranking reasons are observable, stale requests remain isolated per model, and adaptive memory is project-scoped.
- **Positive** - pure engine and memory logic can be tested without Monaco or Zustand; future ranking changes should normally touch one module instead of three or more.
- **Negative** - project persistence gains one versioned field and generated Wails bindings must stay synchronized with its Go model.
- **Neutral** - lazy table documentation remains adapter-facing because it depends on Monaco item resolution.

## Verification

- Engine and ranking: `sqlCompletionEngineCore.test.ts`
- Adaptive memory: `sqlCompletionMemory.test.ts`
- Monaco seam: `sqlCompletionAdapter.test.ts`, `sqlCompletion.test.ts`
- Filter integration: `resultFilterCompletion.test.ts`
- Persistence: `sqlSuggestionSchemaContext.test.ts`, `projectMapper.test.ts`, `project_completion_memory_test.go`

## How to revisit

Revisit if completion generation moves to a worker, a parser service replaces local analysis, or acceptance persistence becomes frequent enough to require batched project writes.
