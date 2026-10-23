# ADR-0006 — Write-safety guard for mutating SQL

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive)

## Context

A SQL IDE makes destructive queries trivially easy. A user can:

- Type `DELETE FROM users;` (no WHERE) — wipes the table.
- Type `UPDATE users SET active = false;` — deactivates everyone.
- Run a half-finished query without realizing it has no scope.

These mistakes have happened in every SQL tool ever. We need a guard that catches the obvious cases without being annoying for legitimate full-table operations.

## Decision

A pre-execution check in [internal/db/write_safety.go](../../internal/db/write_safety.go) inspects mutating statements (`UPDATE`, `DELETE`) and rejects them if they have no `WHERE` clause, unless explicitly confirmed by the user.

The check runs **before** the executor sends the query to the driver. It's a backend concern (not a UI hint) so it cannot be bypassed by hitting "send" twice quickly.

Specific behaviors:
- Confirmation flows through `QueryService` and surfaces as a dialog on the FE.
- Read-only statements (`SELECT`) bypass the guard.
- DDL (`CREATE`, `DROP`, `ALTER`) currently bypasses; environment-aware confirmations (prod-unlock) live in `ProSecurityService`.
- Transactions: the guard applies within a transaction as well (a `DELETE FROM x;` in a tx is still risky).

## Alternatives considered

- **FE-only confirmation dialog** — bypassable, racey, and a sufficiently determined user (or buggy keyboard handler) can confirm twice. The BE guard is the actual safety net.
- **Disable mutating statements entirely in "prod" connections** — too restrictive; users legitimately need to run scoped updates in prod. We use `ProSecurityService.RequireProdUnlock` for prod-specific friction instead.
- **Static SQL parser** to fully analyze queries (e.g. detect `WHERE 1=1`) — possible but overkill. A simple "no WHERE clause → confirm" heuristic catches the actual mistakes that have happened in practice.

## Consequences

- **Positive**: an entire class of catastrophic mistakes is blocked by default. Users can still do mass updates by confirming.
- **Negative**: legitimate "delete all rows" queries require an extra click. Acceptable.
- **Neutral**: the guard is a single Go file with focused tests in `write_safety_test.go`. Easy to extend (e.g. catch `TRUNCATE`).

## How to revisit

- If users complain about false positives, refine the heuristic — don't loosen the guarantee.
- If we add a "data wipe" operation that intentionally takes no WHERE clause (e.g. dev-only seed reset), give it its own explicit path that skips the guard with audit logging.
