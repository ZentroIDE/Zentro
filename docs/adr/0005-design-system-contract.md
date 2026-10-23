# ADR-0005 — Design-system contract: native form controls banned in features

- **Status**: accepted
- **Date**: 2026-05-08 (approximate; introduced in design-system rework)

## Context

A desktop app benefits from a consistent look, feel, accessibility, and keyboard behavior. Native HTML controls (`<button>`, `<input>`, `<textarea>`) drift in three ways:

- **Styling drift** — `<input>` gets styled differently in each feature; cumulative inconsistency.
- **Accessibility drift** — focus rings, ARIA attributes, keyboard handling are easy to miss on raw elements.
- **Theming drift** — dark/light mode requires every native control to be themed individually.

Once styling drift starts, it's very hard to claw back.

## Decision

Feature code (everything under `frontend/src/features/` and most of `frontend/src/components/`) must use design-system primitives from [frontend/src/components/ui](../../frontend/src/components/ui):

- `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Dialog`, `Tooltip`, `Toast`, `Popover`, `Tabs`, `DropdownMenu`, `Switch`, `Slider`, …
- Primitives are built on Radix UI + Tailwind + `class-variance-authority` for variants.

Enforcement:

1. [scripts/check-fe-guardrails.mjs](../../scripts/check-fe-guardrails.mjs) statically forbids `<button>`, `<input>`, `<textarea>` in feature code, with an explicit allowlist for the few legitimate exceptions (e.g. the design-system primitives themselves).
2. A runtime contract spec ([frontend/src/components/ui/designSystemContract.test.tsx](../../frontend/src/components/ui/designSystemContract.test.tsx)) asserts each primitive's public API (props, exported names) so accidental breakage of the contract fails CI.

## Alternatives considered

- **Convention only** — fails over time. Once two features have native `<input>`, the third feels free to copy.
- **Hand-written `BaseButton` etc. wrappers without Radix** — we'd be reinventing accessibility (focus management, dialog focus traps, dropdown keyboard nav). Radix solves this.
- **Material UI / Chakra / Mantine** — heavier; opinions don't match the project's "quiet, dense, professional" aesthetic. Tailwind + Radix gives us full styling control.

## Consequences

- **Positive**: consistent look + a11y by default. Theming centralized in Tailwind tokens + primitive variants.
- **Positive**: adding a new control type is a deliberate act (write a primitive, add to contract spec) rather than ad-hoc per feature.
- **Negative**: primitives have a learning curve. New contributors occasionally try native controls and hit the guardrail. The error message points them to `components/ui/`.
- **Neutral**: bundle size: Radix is tree-shakeable per primitive. We pay for what we import.

## How to revisit

If a feature genuinely needs a control no primitive supports, add a primitive — don't bypass. If the cost of writing primitives is so high that features stall, reconsider the primitive API design, not the enforcement.
