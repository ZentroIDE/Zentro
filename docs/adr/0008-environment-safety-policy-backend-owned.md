# ADR-0008 — Environment safety policy is backend-owned with a production floor

- **Status**: accepted
- **Date**: 2026-07-09

## Context

Environment strictness was derived in four backend sites with two disagreeing rules (`pro||sta` for write-safety, `pro`-only for production ceremonies and pre-DDL snapshots), while the frontend kept its own configurable policy in localStorage — per-environment safety-level profiles plus a separate `strongConfirmFromEnvironment` threshold — that the backend never read. The drift was live: an UPDATE without WHERE on staging was rejected by the backend with a raw error while the frontend, whose threshold defaulted to production-only, never showed the strong-confirmation ceremony. `GetExecutionPolicy` on the backend was dead code with a third, disagreeing set of row caps.

## Decision

1. **Two named domain concepts** (see [CONTEXT.md](../../CONTEXT.md)): **Production** is an identity (`env == pro`) gating production-only ceremonies (unlock, type-to-confirm, cooldown, reason, pre-DDL snapshot). **Safety Level** (`strict | balanced | relaxed`, per environment) is the single strictness axis gating write-safety and execution limits.
2. **One backend module** (`EnvironmentPolicy`) resolves the Execution Policy for an environment — level, production identity, row cap, timeout, destructive rules — as `f(level, isProduction)`. All environment predicates converge on it.
3. **The backend owns Safety Level assignments** — a global map by environment key in preferences. The frontend reads and writes only through the Wails API and renders the result; it holds no policy state of its own.
4. **Safety Floor**: Production's Safety Level is always `strict` and cannot be lowered. Staging defaults to `strict` but may be lowered deliberately.
5. **The `strongConfirmFromEnvironment` threshold is removed.** Strong Confirmation derives from `Safety Level == strict` — never its own setting.
6. **No migration** of prior localStorage policy values (pre-launch); the frontend clears stale storage keys on startup.

## Alternatives considered

- **Frontend keeps ownership, backend keeps a hardcoded floor** — no migration, but two sources of truth forever; drift narrows instead of ending, and future Team/Enterprise central policy has no enforcement point.
- **One-axis model** (production is just the top strictness notch) — would re-scope paid production ceremonies onto any strict environment, changing preflight semantics for no user request.
- **Floor covering staging too** — preserves today's guarantee exactly, but teams that use staging as a sandbox get friction with no legitimate escape; the floor exists for production's irreversibility, which staging doesn't share.
- **Tier-based floor** (free floored wider than paid) — inverts "paid strengthens enforcement" and drags entitlement logic into the policy module.

## Consequences

- **Positive**: one predicate source; the frontend cannot weaken enforcement (ADR-0006's guard keeps its meaning). The staging UX gap closes — ceremonies and enforcement come from the same answer.
- **Positive**: safety settings persist with the app, not browser storage.
- **Negative**: new Wails API + preference persistence surface; a removed user-facing setting (the strong-confirm slider).
- **Negative**: staging becomes relaxable — a deliberate, explicit loosening relative to the old hardcoded `pro||sta`.

## How to revisit

- If teams need different levels per project, move storage onto the project model — the module interface stays.
- If Team/Enterprise central policy management arrives, this module is the enforcement point; policy sync feeds it rather than bypassing it.
