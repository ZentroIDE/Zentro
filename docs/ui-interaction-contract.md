# UI Interaction Contract

This document defines the interaction-state styling contract for Zentro frontend work.

## Rules

- Treat `hover`, `selected`, `active`, `focus`, disabled, and status-tinted interactions as semantic roles owned by the design system.
- Reuse recipes from `frontend/src/components/ui/contract.ts` first.
- Reuse semantic pattern classes from `frontend/src/styles/patterns.css` when a recipe maps to a shared CSS role.
- Use `frontend/src/styles/tokens.css` only to define or extend semantic state tokens.
- Do not author feature-local interactive color mixes such as `hover:bg-*`, `hover:text-*`, `bg-primary/15`, `border-primary/35`, or direct `var(--state-*)` usage in feature TSX.

## Allowed

- Layout, spacing, sizing, and typography utilities in feature components.
- Contract recipes such as `interactiveSurface`, `interactiveSelectable`, `interactiveSelected`, `interactiveActive`, `interactiveIconAction`, `interactiveDestructive`, `interactiveSuccess`, `interactiveInfo`, `controlInfo`, and `interactiveBadge`.
- Status tones `success`, `warning`, `destructive`, and `info` via `tone`/`data-tone`. `destructive` is the canonical red tone (`error`/`danger` are not color names).
- Primitive-level exceptions inside `components/ui` when the recipe layer is the owner of that behavior.

## Not Allowed

- Feature-local selection colors.
- Feature-local hover colors for reusable interaction states.
- Ad-hoc status hover states in feature files.
- Direct semantic state token references in feature TSX when a contract recipe should own that behavior.
- Using `bg-muted` to represent a selected state — use `interactiveSelected`/`--state-selected-*` via the recipe layer.

## Workflow

1. If the interaction meaning already exists, import the recipe from `components/ui/contract.ts`.
2. If the meaning repeats but has no recipe, add a semantic pattern/tokens update in the design-system layer.
3. Only after the contract exists should feature code consume it.

## Verification

- Run `node scripts/check-fe-guardrails.mjs`.
- Run the design-system contract test.
- For migrated surfaces, manually verify hover, selected, active, disabled, and focus-visible states in both themes.
