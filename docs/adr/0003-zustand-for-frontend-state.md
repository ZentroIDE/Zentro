# ADR-0003 — Zustand for frontend state

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive)

## Context

Zentro's frontend has many concerns that need shared state across components: open editor tabs, query results (potentially millions of rows), connection profiles, schema cache, layout preferences, user settings, shortcut registry, log buffer.

We needed a state library that:

- Allows fine-grained subscriptions (a chart component re-rendering on every keystroke in another tab is unacceptable).
- Stays out of the way for simple cases.
- Has a small bundle footprint (desktop binary size matters).
- Supports persistence for parts of state that should survive restart.
- Doesn't require boilerplate (actions, reducers, dispatchers) for what is mostly local-app state.

## Decision

We use **Zustand**, one store per concern. Stores live in `frontend/src/stores/`:

- `editorStore`, `resultStore`, `schemaStore`, `connectionStore`, `projectStore`, `environmentStore`, `settingsStore`, `layoutStore`, `sidebarUiStore`, `bookmarkStore`, `templateStore`, `shortcutStore`, `statusStore`, `logStore`, `zoomStore`, `rowDetailStore`, `scriptStore`.

Conventions:
- Stores are the source of truth. Components subscribe via selectors; never copy store state into local state for display.
- Service modules (`frontend/src/services/`) mutate stores via store actions; components don't call actions on other components' stores directly.
- Persistence via zustand's `persist` middleware, scoped to the parts of state that should survive restart (open tabs, recent connections, user preferences) — not transient state (current result rows, loading flags).

## Alternatives considered

- **Redux Toolkit** — heavier API surface for a desktop app; we don't need time-travel debugging or middleware ecosystem. Bundle size: ~13 KB vs Zustand's ~1 KB.
- **Jotai** — atom-based, but the project's mental model favors concern-grouped stores over many small atoms. Either would work; Zustand chosen for familiarity.
- **React Context + reducers** — fine for small apps; doesn't scale to 15+ concerns without re-render hell because Context re-renders all consumers on any update.
- **TanStack Query** — relevant for server-state, but Zentro has no server. Wails is RPC-like and we cache results ourselves in stores.

## Consequences

- **Positive**: each store is a self-contained file; new contributors can read one store and understand one concern. Selectors give granular re-renders. Persistence is opt-in per slice.
- **Negative**: 17 stores is a lot. Discovering the right store requires a map (provided in [ARCHITECTURE.md § State coupling](../../ARCHITECTURE.md)).
- **Neutral**: no global "redux devtools"-style time-travel; we accept this trade for boilerplate-free code.

## How to revisit

If two stores routinely need to coordinate updates atomically (e.g. open a tab AND set the active connection in one transaction), and we end up with cross-store glue code in services, consider consolidating or introducing a coordinator layer.
