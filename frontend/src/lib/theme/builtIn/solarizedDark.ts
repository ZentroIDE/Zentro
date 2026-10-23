// SPDX-License-Identifier: GPL-3.0-only

import type { ThemePreset } from '../themePresetTypes';

// Official Solarized palette (Ethan Schoonover) — fixed public spec.
// base03 #002b36  base02 #073642  base01 #586e75  base00 #657b83
// base0  #839496  base1  #93a1a1  base2  #eee8d5  base3  #fdf6e3
// accents: yellow #b58900  orange #cb4b16  red #dc322f  magenta #d33682
//          violet #6c71c4  blue #268bd2  cyan #2aa198  green #859900
//
// Tone map (Solarized "Dark" column of the spec's usage table):
//   background            -> base03
//   background highlights -> base02   (panels, elevated, overlay, selection)
//   comments / secondary  -> base01
//   body text / primary   -> base0
//   emphasized content    -> base1
// Syntax follows the canonical Solarized vim colorscheme: every Constant
// (string, number, boolean) is cyan; keywords/operators are green; functions
// and built-ins are blue; delimiters keep the default body foreground.
export const solarizedDark: ThemePreset = {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    appearance: 'dark',
    builtIn: true,
    tokens: {
        '--surface-app': '#002b36',
        '--surface-panel': '#073642',
        '--surface-elevated': '#073642',
        '--surface-overlay-card': '#073642',
        '--content-primary': '#93a1a1',
        '--content-emphasized': '#93a1a1',
        '--content-secondary': '#586e75',
        '--content-muted': '#586e75',
        '--border-default': '#586e75',
        '--user-accent': '#00495c',
        '--interactive-text': '#2aa198',
        '--status-success': '#859900',
        '--status-destructive': '#dc322f',
        '--status-warning': '#b58900',
        '--status-info': '#6c71c4',
        '--overlay-backdrop': 'rgb(0 5 8 / 60%)',
        '--overlay-backdrop-strong': 'rgb(0 5 8 / 72%)',
        '--syntax-key': '#859900',
        '--syntax-string': '#2aa198',
        '--syntax-number': '#2aa198',
        '--syntax-boolean': '#2aa198',
        '--syntax-bracket': '#839496',
        // A flat base02 here is literally the same fill as --surface-panel /
        // --surface-overlay-card, so a "selected" row in a popover, dropdown,
        // or Monaco's suggest widget (which all sit on those surfaces) painted
        // invisibly — same color as its own background. Needs to be a tint
        // that stands out from base02, and a literal (not color-mix()/var())
        // because this value also feeds Monaco's editor.selectionBackground,
        // which can't resolve CSS functions — see monacoThemeFromTokens.ts.
        // Tinted with this theme's own accent (#00495c) at 12% alpha — the
        // same weight dark2026.ts's color-mix(primary 12%, transparent) uses
        // — instead of a flat base01 gray, so it reads as "this app's
        // primary color" like every other theme instead of a color-agnostic
        // wash. Hand-computed since color-mix() can't be used here; if the
        // accent changes, recompute (hex alpha = round(pct/100*255)).
        '--state-selected-bg': '#00495c1f',
        // Text on a selected row/nav-item needs --interactive-text (the
        // bright cyan), not --interactive-primary — Solarized Dark's primary
        // (#00495c) is a dark navy meant for button FILLS with white text on
        // top, not for text painted directly on this already-dark surface;
        // using it here made selected nav items unreadable, blending into
        // their own background.
        '--state-selected-text': 'var(--interactive-text)',
        '--state-selected-border': '#586e75',
        // Same formula as Zentro Dark's own --state-hover-bg: a tint of
        // --content-primary, not --surface-panel. Mixing in the surface color
        // barely shifted anything since --surface-panel (#073642) sits so
        // close to --surface-app/--card in this theme — hover was
        // imperceptible. Tinting with the text color instead reads as a
        // visible highlight regardless of how close the theme's surfaces are
        // to each other.
        '--state-hover-bg': 'color-mix(in srgb, var(--content-primary) 6%, transparent)',
        // An opaque base01 fill sits almost on top of --content-primary
        // (#839496) in luminance — text painted on it (BookmarkTab's active
        // row, SourceControlHistoryView's expanded row) drops to roughly a
        // 1.7:1 contrast ratio, well under WCAG's 4.5:1 floor. Needs the same
        // translucent-tint treatment as the rest of this theme's state layers.
        '--state-active-bg': 'color-mix(in srgb, #586e75 40%, transparent)',
        // Row/cell selection background use the exact same 8%/14% split as
        // Zentro Dark's own tokens (dark2026.ts) — the tone still reads as
        // Solarized's own accent (teal, via --interactive-primary) rather
        // than Zentro's green, but the split itself is synced so a selected
        // cell inside a selected row reads with the same relative weight in
        // every dark theme instead of Solarized inventing its own ratio.
        '--state-row-selected-bg': 'color-mix(in srgb, var(--interactive-primary) 8%, transparent)',
        '--state-row-selected-accent': 'var(--interactive-primary)',
        '--state-row-selected-solid-bg': 'var(--interactive-primary)',
        '--state-cell-selected-bg':
            'color-mix(in srgb, var(--interactive-primary) 14%, transparent)',
        '--state-cell-selected-border': 'var(--interactive-primary)',
        '--state-active-text': 'var(--interactive-primary)',
        '--state-row-selected-solid-text': 'var(--content-inverse)',
        // Same base01 translucent-tint treatment as --state-active-bg above — no
        // drag-and-drop UI reads this today, but it should look native, not
        // borrowed, whenever one ships.
        '--state-drag-over-bg': 'color-mix(in srgb, #586e75 40%, transparent)',
        '--state-drag-over-border': 'var(--interactive-primary)',
        '--radius-scale-sm': '3px',
        '--radius-scale-md': '6px',
        '--radius-scale-lg': '10px',
        '--radius-scale-xl': '16px',
        '--font-family-sans': 'var(--user-font-sans)',
        '--font-family-mono': 'var(--user-font-mono)',
        // chart-1 follows --user-accent like every other theme. chart-2..5
        // are hand-picked distinct native Solarized hues instead — the shared
        // default derivation (--syntax-key/--status-success/--status-warning/
        // --status-destructive) collapses to the same #859900 green for both
        // --chart-2 and --chart-3 in Solarized (syntax-key and status-success
        // happen to be the same green here). No chart feature consumes these
        // yet, but a future one shouldn't inherit a two-way color collision.
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
    monaco: { id: 'zentro-sql-solarized-dark' },
};
