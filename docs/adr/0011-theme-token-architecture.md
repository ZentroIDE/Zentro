# ADR 0011 — Theme Token Architecture (Seed → Map → Alias, `destructive` canonical)

## Status

Accepted.

## Context

Zentro shipped four theme presets that could only override 18 "anchor" color
tokens; every interactive-state color was mechanically derived from
`--interactive-primary` in `tokens.css`, identically for every preset. Solarized
could not author its own selection/hover/active colors, and the red "danger"
concept existed under three names (`--status-error`, `--destructive`, and the
design-system `danger` tone) across ~30 files.

We reworked the token model into three layers and, anticipating a future
user-facing custom-theme editor, extended the preset model to carry non-color
seeds (radius + fonts) in addition to colors.

## Decision

### Seed → Map → Alias

- **Seed** — the overridable set in `ThemePreset.tokens` (typed by
  `ThemeToken` / `THEME_TOKENS` in `themePresetTypes.ts`). Includes color
  anchors, interactive-state tokens, status tones, `--chart-1..5`, the
  `--sidebar-*` family, and the non-color seeds `--radius-scale-*`,
  `--font-family-sans`, `--font-family-mono`.
- **Map** — derived-only tokens in `tokens.css` (state mixes, shadcn aliases,
  spacing, motion, etc.). They are not preset-overridable unless a name is also
  listed in `THEME_TOKENS`.
- **Alias** — Tailwind-facing names in `index.css`'s `@theme` block
  (`--color-*`), generated as `text-*`/`bg-*`/`border-*` utilities.

### Override mechanism (clear-then-set)

`applyThemePreset` clears every `THEME_TOKENS` inline custom property on `<html>`
then sets only the preset's own tokens. Inline `style.setProperty` always wins
over `:root`/`[data-theme='light']` rules, so a preset omitting a token falls
through to the `tokens.css` default — the lossless-fallback behavior. Adding a
new overridable token is just a union + array entry; `applyThemePreset` needs no
logic change.

### `destructive` is the single canonical red name

The red status/error/danger color is named `destructive` everywhere:

- Seed: `--status-destructive` (feeds `--destructive`).
- Derived: `--state-destructive-bg/border/solid-bg/solid-text`.
- Tailwind: `text-destructive`, `bg-destructive`, `border-destructive`.
- Tone: `ComponentTone`/`ButtonTone` use `'destructive'`; recipes are
  `controlDestructive`, `interactiveDestructive`, `interactiveGhostDestructive`,
  `interactiveMenuItemDestructive`.

`error` and `danger` remain **only** as semantic/severity words, not colors:
`ComponentState 'error'`/`state='error'`, `LogLevel.ERROR`,
`ToastVariant.ERROR`, `DataTableRowLifecycle.ERROR`, `WriteSafetySeverity.DANGER`,
`RiskLevel.DANGER`, `UiAction.danger`, `ContextMenuItem danger`, and
`decision.severity === 'danger'`.

### Future custom-theme editor

`ThemePreset.builtIn: false` and the full shadcn `registry:theme` variable set
(`--chart-1..5`, `--sidebar-*`, plus the existing background/foreground/card/
popover/primary/secondary/muted/accent/destructive/border/input/ring/radius
aliases) mean a future editor can import/export any shadcn theme JSON losslessly.
The editor's pickers bind to Zentro **seed** tokens; the serializer maps shadcn
names to Zentro names.

### shadcn `registry:theme` ↔ Zentro token mapping

| shadcn key | Zentro seed/derived |
|---|---|
| `--background` / `--foreground` | `--surface-app` / `--content-primary` |
| `--card` / `--card-foreground` | `--surface-panel` / `--content-primary` |
| `--popover` / `--popover-foreground` | `--surface-overlay-card` / `--content-primary` |
| `--primary` / `--primary-foreground` | `--user-accent` / `--content-inverse` |
| `--secondary` / `--secondary-foreground` | `--surface-elevated` / `--content-primary` |
| `--muted` / `--muted-foreground` | `--surface-elevated` / `--content-secondary` |
| `--accent` / `--accent-foreground` | derived from `--user-accent` / `--content-primary` |
| `--destructive` / `--destructive-foreground` | `--status-destructive` / `--content-inverse` |
| `--border` / `--input` / `--ring` | `--border-default` / `--border-default` / `--focus-ring` |
| `--radius` | `--radius-scale-md` |
| `--chart-1..5` | `--chart-1..5` (direct) |
| `--sidebar-*` | `--sidebar-*` (direct) |

## Consequences

- Solarized can now author authentic selection/hover/active/status colors
  (`base02`/`base2` selection) instead of inheriting the generic accent-derived
  formula, and its log-severity colors derive from its own palette.
- The red color has one name. `Button` intentionally has both
  `variant='destructive'` and `tone='destructive'` (`variant='destructive'` ≡
  `variant='default' tone='destructive'`) — a pre-existing redundancy now made
  consistent, not a new alias problem.
- Lossless requirement: `dark-2026`/`light-2026` are pixel-identical to before;
  any deviation is a bug, not a tradeoff.
- Adding a token to `THEME_TOKENS` makes it individually overridable per preset
  with no further mechanism.
- Monaco editor colors and SQL syntax rules are derived from seed tokens via
  `buildMonacoCustomTheme` (`monacoThemeFromTokens.ts`), so a future palette-only
  theme omits `monaco.custom`; `registerSqlMonacoThemes` auto-derives it for any
  preset with tokens but no explicit custom theme.

## Deferred

- Re-scoping `Tabs`/`TabsTrigger`'s active-state color inside the sidebar to
  `--sidebar-primary`/`--sidebar-accent` (instead of the shared `--tab-active-bg`/
  `--interactive-primary`) is a separate follow-up.
- Non-color seeds beyond radius + font families (spacing, control sizes, motion,
  font size) remain follow-ups before the custom-theme editor ships.
