// SPDX-License-Identifier: GPL-3.0-only

import type { ThemePreset } from '../themePresetTypes';

// Official Solarized palette (Ethan Schoonover) — see solarizedDark.ts for the
// full base03..base3/accent reference.
//
// Tone map (Solarized "Light" column of the spec's usage table):
//   background            -> base3
//   background highlights -> base2   (panels, elevated, overlay, selection)
//   comments / secondary  -> base1
//   body text / primary   -> base00
//   emphasized content    -> base01
// Syntax follows the canonical Solarized vim colorscheme: every Constant
// (string, number, boolean) is cyan; keywords/operators are green;
// delimiters keep the default body foreground. Functions/built-ins
// ("predefined") and the UI accent both use this theme's own primary
// (base03, see --user-accent below) rather than the shared blue — Light
// deliberately doesn't reuse Dark's accent hue, so the two variants each
// carry their own identity instead of one color borrowed across both.
export const solarizedLight: ThemePreset = {
    id: 'solarized-light',
    label: 'Solarized Light',
    appearance: 'light',
    builtIn: true,
    tokens: {
        '--surface-app': '#fdf6e3',
        '--surface-panel': '#eee8d5',
        '--surface-elevated': '#eee8d5',
        '--surface-overlay-card': '#eee8d5',
        '--content-primary': '#50646c',
        '--content-emphasized': '#586e75',
        '--content-secondary': '#93a1a1',
        '--content-muted': '#93a1a1',
        '--border-default': '#93a1a1',
        // Primary/accent is this theme's own gold (#8a6914) — not the shared
        // accent Solarized Dark now uses (teal #00495c) nor the canonical
        // spec's single blue for both modes. Deliberately diverges from that
        // convention: Solarized Light gets its own warm, high-contrast primary
        // against the base3 paper surface instead of borrowing a dark-mode
        // accent. Cascades into Monaco's "predefined" syntax color and the log
        // panel's info/query color too (both derive from --user-accent) —
        // intentional, not a side effect to work around.
        '--user-accent': '#8a6914',
        '--interactive-text': 'var(--interactive-primary)',
        '--status-success': '#859900',
        '--status-destructive': '#dc322f',
        '--status-warning': '#b58900',
        '--status-info': '#6c71c4',
        '--overlay-backdrop': 'rgb(101 123 131 / 30%)',
        '--overlay-backdrop-strong': 'rgb(101 123 131 / 44%)',
        '--syntax-key': '#859900',
        '--syntax-string': '#2aa198',
        '--syntax-number': '#2aa198',
        '--syntax-boolean': '#2aa198',
        '--syntax-bracket': '#657b83',
        // A flat base2 here is literally the same fill as --surface-panel /
        // --surface-overlay-card, so a "selected" row in a popover, dropdown,
        // or Monaco's suggest widget (which all sit on those surfaces) painted
        // invisibly — same color as its own background. Needs to be a tint
        // that stands out from base2, and a literal (not color-mix()/var())
        // because this value also feeds Monaco's editor.selectionBackground,
        // which can't resolve CSS functions — see monacoThemeFromTokens.ts.
        // Tinted with this theme's own accent (#8a6914) at 14% alpha — the
        // same weight light2026.ts's color-mix(primary 14%, transparent)
        // uses — instead of a flat base1 gray, so it reads as "this app's
        // primary color" like every other theme instead of a color-agnostic
        // wash. Hand-computed since color-mix() can't be used here; if the
        // accent changes, recompute (hex alpha = round(pct/100*255)).
        '--state-selected-bg': '#8a691424',
        '--state-selected-text': 'var(--interactive-primary)',
        '--state-selected-border': '#93a1a1',
        // Same formula as Zentro Light's own --state-hover-bg: a tint of
        // --content-primary, not --surface-panel. Mixing in the surface color
        // barely shifted anything since --surface-panel (#eee8d5) sits so
        // close to --surface-app/--card in this theme — hover was
        // imperceptible. Tinting with the text color instead reads as a
        // visible highlight regardless of how close the theme's surfaces are
        // to each other.
        '--state-hover-bg': 'color-mix(in srgb, var(--content-primary) 7%, transparent)',
        // An opaque base1 fill sits almost on top of --content-primary
        // (#657b83) in luminance — text painted on it (BookmarkTab's active
        // row, SourceControlHistoryView's expanded row) drops to roughly a
        // 1.7:1 contrast ratio, well under WCAG's 4.5:1 floor. Needs the same
        // translucent-tint treatment as the rest of this theme's state layers.
        '--state-active-bg': 'color-mix(in srgb, #93a1a1 42%, transparent)',
        // Row selection background tints with the live accent, same as the
        // cell selection below — a flat base1 gray here (the old behavior)
        // read as an unrelated neutral wash instead of a selection state.
        // Kept lighter (8%) than the cell selection's 16% so a selected cell
        // inside a selected row still reads as more prominent than the row
        // wash around it. The border/accent indicator tracks
        // var(--interactive-primary) — this theme's own gold — like every
        // other theme: a selection outline is a universal UI convention that
        // should follow the live accent, not a color pinned in place.
        '--state-row-selected-bg': 'color-mix(in srgb, var(--interactive-primary) 8%, transparent)',
        '--state-row-selected-accent': 'var(--interactive-primary)',
        '--state-row-selected-solid-bg': 'var(--interactive-primary)',
        // Cell selection background, unlike the row wash above, uses a
        // stronger 16% mix (Zentro Light's own value) so a selected data-grid
        // cell reads as "this app's primary color" — and stays visibly more
        // prominent than the lighter row wash around it.
        '--state-cell-selected-bg':
            'color-mix(in srgb, var(--interactive-primary) 14%, transparent)',
        '--state-cell-selected-border': 'var(--interactive-primary)',
        '--state-active-text': 'var(--interactive-primary)',
        '--state-row-selected-solid-text': 'var(--content-inverse)',
        '--state-drag-over-bg': 'color-mix(in srgb, #93a1a1 42%, transparent)',
        '--state-drag-over-border': 'var(--interactive-primary)',
        '--radius-scale-sm': '3px',
        '--radius-scale-md': '6px',
        '--radius-scale-lg': '10px',
        '--radius-scale-xl': '16px',
        '--font-family-sans': 'var(--user-font-sans)',
        '--font-family-mono': 'var(--user-font-mono)',
        // chart-1 follows --user-accent like every other theme; chart-2..5
        // are hand-picked distinct native Solarized hues — see solarizedDark.ts
        // for why (syntax-key/status-success collide on the same green).
        '--chart-1': 'var(--user-accent)',
        '--chart-2': '#2aa198',
        '--chart-3': '#859900',
        '--chart-4': '#b58900',
        '--chart-5': '#dc322f',
        '--sidebar': 'var(--card)',
        '--sidebar-foreground': 'var(--card-foreground)',
        '--sidebar-primary': 'var(--interactive-primary)',
        '--sidebar-primary-foreground': 'var(--content-inverse)',
        '--sidebar-accent': 'var(--accent)',
        '--sidebar-accent-foreground': 'var(--accent-foreground)',
        '--sidebar-border': 'var(--border-panel)',
        '--sidebar-ring': 'var(--focus-ring)',
        '--btn-primary-bg': 'var(--interactive-primary)',
        '--btn-primary-bg-hover': 'var(--interactive-primary-hover)',
        '--btn-primary-bg-active': 'color-mix(in srgb, var(--interactive-primary) 72%, #000)',
        '--btn-primary-fg': 'var(--content-inverse)',
        '--btn-secondary-bg': 'var(--surface-elevated)',
        '--btn-secondary-bg-hover':
            'color-mix(in srgb, var(--content-primary) 8%, var(--surface-elevated))',
        '--btn-secondary-bg-active':
            'color-mix(in srgb, var(--content-primary) 16%, var(--surface-elevated))',
        '--btn-secondary-fg': 'var(--content-primary)',
        '--btn-secondary-border': 'var(--border-default)',
        '--btn-outline-fg': 'var(--interactive-text)',
        '--btn-outline-border': 'var(--interactive-text)',
        '--btn-outline-bg-hover': 'color-mix(in srgb, var(--interactive-text) 16%, transparent)',
        '--btn-outline-bg-active': 'color-mix(in srgb, var(--interactive-text) 26%, transparent)',
        '--btn-ghost-fg': 'var(--content-primary)',
        '--btn-ghost-bg-hover': 'color-mix(in srgb, var(--content-primary) 10%, transparent)',
        '--btn-ghost-bg-active': 'color-mix(in srgb, var(--content-primary) 18%, transparent)',
        '--btn-link-fg': 'var(--interactive-text)',
        '--btn-link-fg-hover': 'color-mix(in srgb, var(--interactive-text) 80%, #000)',
        '--btn-destructive-bg': 'var(--state-destructive-solid-bg)',
        '--btn-destructive-bg-hover': 'color-mix(in srgb, var(--btn-destructive-bg) 85%, #000)',
        '--btn-destructive-bg-active': 'color-mix(in srgb, var(--btn-destructive-bg) 72%, #000)',
        '--btn-destructive-fg': 'var(--state-destructive-solid-text)',
        '--btn-focus-ring': 'color-mix(in srgb, var(--interactive-text) 45%, transparent)',
        '--btn-radius': 'var(--radius-scale-sm)',
    },
    monaco: { id: 'zentro-sql-solarized-light' },
};
