# ADR-0004 — Feature-first frontend modules with boundary guardrail

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive)

## Context

A frontend grows in features over time. Without enforced boundaries, features bleed into each other:

- Feature A imports a hook from feature B, then B imports a util from A, creating a cycle.
- A "small refactor" in feature B silently breaks feature A because the coupling wasn't visible.
- New developers can't tell which code is owned by which concern.

We need an enforced rule that makes ownership obvious and refactoring local.

## Decision

Feature code lives under `frontend/src/features/<name>/`. Each feature is **sovereign**:

- A feature CAN import from `components/`, `lib/`, `services/`, `stores/` (the shared layers).
- A feature CANNOT relatively-import from another feature's directory. `features/foo/x.ts` may not `import … from "../bar/y.ts"`.
- Cross-feature communication goes through the **command bus** (`lib/commandBus.ts`) or through **stores** (zustand) — both of which are shared layers, not features.

This is enforced statically by [scripts/check-feature-boundaries.mjs](../../scripts/check-feature-boundaries.mjs), wired into the pre-push hook.

## Alternatives considered

- **No enforcement** — relies on review discipline. Fails over time as the team grows.
- **NPM workspaces or local packages per feature** — adds tooling complexity (multiple package.json, build coordination) without much win for a single-binary desktop app.
- **TypeScript path mapping with private/public split per feature** (e.g. only export from `features/foo/index.ts`) — partially helps, but doesn't prevent relative paths bypassing it. The grep-based guardrail is more reliable.

## Consequences

- **Positive**: refactoring a feature is local. Deleting a feature is removing its directory. Ownership is visible by directory.
- **Positive**: when two features need to coordinate, the natural answer ("how do I import from there?") forces the right question: should this be a shared concern? If yes, promote to `components/`, `lib/`, `stores/`. If no, use the command bus.
- **Negative**: developers occasionally try to import across features and get blocked by the guardrail. The error message is clear (`scripts/check-feature-boundaries.mjs`) — once seen, it's a 5-minute fix.
- **Neutral**: 48 feature directories today. Promotes folder-level discoverability over file-name discoverability.

## How to revisit

If we routinely find ourselves duplicating logic across features because the boundary forbids sharing, we have two options: (a) promote the shared code to a shared layer (already supported), or (b) merge the features. The boundary itself should not be relaxed — that defeats the point.
