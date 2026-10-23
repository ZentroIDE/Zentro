# ADR-0002 — Event names are constants, paired BE↔FE

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive)

## Context

Wails pushes data from backend to frontend via named events (`runtime.EventsEmit(ctx, "schema:loaded", payload)`). Without discipline, event names tend to:

- Get typo'd silently — a misspelled emit name produces no error; the listener simply never fires.
- Drift between BE and FE — a rename on one side doesn't surface as a compile error.
- Spread across the codebase — making it impossible to know what events exist.

We need an enforceable single source of truth.

## Decision

1. All BE event literals live in [internal/constant/events.go](../../internal/constant/events.go) as exported `const Event* = "..."` declarations.
2. BE code emits via the `EventEmitter` abstraction ([internal/app/event_emitter.go](../../internal/app/event_emitter.go)), passing the constant — never a raw string.
3. The corresponding FE event names live in [frontend/src/lib/constants.ts](../../frontend/src/lib/constants.ts) as a const object (e.g. `DOM_EVENT`).
4. A guardrail script ([scripts/check-be-guardrails.mjs](../../scripts/check-be-guardrails.mjs)) statically verifies:
   - No hardcoded event string literals outside `internal/constant/events.go`.
   - Only 5 designated files may import `github.com/wailsapp/wails/v2/pkg/runtime` (`app.go`, `connection_service.go`, `event_emitter.go`, `dialogs.go`, `query_export.go`).

## Alternatives considered

- **No enforcement, trust convention** — fails in practice; we tried this and got two name-drift bugs in the first month.
- **Generate FE constants from BE constants at build time** — better long-term, but adds tooling complexity. Deferred until name drift recurs despite this ADR.
- **Use typed events (interface-based)** — Wails doesn't support this natively; would require a wrapper layer with significant boilerplate.

## Consequences

- **Positive**: typo'd event names fail the guardrail. The two constant files form a "dictionary" of all BE↔FE messages — searchable, reviewable.
- **Negative**: adding an event requires editing 2 files (BE + FE constants). Not automated — see "How to revisit".
- **Neutral**: the 4-file fence on `runtime` imports forces all service code through `EventEmitter`, which also makes services unit-testable with a fake emitter.

## How to revisit

If event count exceeds ~50 or name-drift bugs recur, switch to code-generated FE constants (one source of truth, generated downstream). Until then, the dual-file convention is cheap enough.
