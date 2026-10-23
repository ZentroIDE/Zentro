# ADR-0007 — `App` as Wails facade, services hold logic

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive)

## Context

Wails binds **one** Go struct to the JavaScript layer. Every method on that struct becomes a callable from the frontend. This creates pressure to put everything on one struct, which violates SRP and grows into a god object.

Without a convention, two failure modes appear:

1. The struct grows logic methods (~200 LOC each) and becomes unreviewable.
2. The struct stays thin but the logic ends up in `internal/app/helpers.go` or similarly vague locations.

## Decision

`App` ([internal/app/app.go](../../internal/app/app.go)) is the only Wails-bound struct. We accept this constraint and impose:

1. **Methods exposed to FE live on `App`**, but each is grouped into a `app_<concern>_facade.go` file (e.g. `app_connection_facade.go`, `app_git_tracking_facade.go`). The facade file holds **only** the public Wails method definitions.
2. **Facades are thin** — each method body is ≤3 lines and delegates to a service.
3. **Services live in `internal/app/<concern>_service.go`** as separate structs with constructor-injected dependencies. They hold the actual logic, can be unit-tested, and never import Wails.
4. **Services share state with `App` via closures** in their constructors, e.g. `func() *sql.DB { return a.db }`. This keeps the source-of-truth pointer on `App` while letting services read the current value.

The result: `App` has ~88 public methods (today), but each is 3 lines. Real complexity lives in 20+ service files, each focused on one concern.

## Alternatives considered

- **One giant `App` with logic methods** — unreviewable. Tested.
- **Multiple Wails-bound structs** — Wails v2 doesn't support this cleanly. Would require a custom binding layer.
- **Code generation from service interfaces** — possible, but adds tooling for a problem that doesn't actually hurt as long as facades stay thin.
- **gRPC-style routing through a single `Execute(method, args)` method** — defeats Wails's IDE autocomplete and TypeScript typing benefits.

## Consequences

- **Positive**: services are testable without Wails. New developers find concerns quickly via filename.
- **Positive**: discovering "which facade does this go in?" is a category question, not a "where does any code live?" question.
- **Negative**: `app.go` defines an 88-method type. The size is largely declarative (field initialization + lifecycle), but it's still imposing on first read. Mitigation: GoDoc on the `App` struct points to ARCHITECTURE.md and EXTENDING.md.
- **Neutral**: 60+ files in `internal/app/`. Use the filename pattern (`app_*_facade.go`, `*_service.go`, `*_test.go`) to navigate.

## How to revisit

- If a facade method body exceeds 3 lines or contains conditional logic, the logic is leaking — push it into the service.
- If a service grows past ~600 LOC, split it (see `git_tracking_service.go` in [TECH-DEBT.md](../TECH-DEBT.md)).
- If Wails v3 (or a successor) allows binding multiple structs cleanly, reconsider the single-`App` constraint.
