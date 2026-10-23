// SPDX-License-Identifier: GPL-3.0-only

// Theme preset data shape — plain, JSON-serializable objects so a future
// import/export ("theme store") flow can apply an imported file through the
// exact same code path as a built-in preset, with no format redesign.
//
// `tokens` is the overridable set of CSS custom properties. Most tokens in
// tokens.css (--state-*, shadcn aliases, spacing, motion...) derive from these
// via existing var()/color-mix() chains; a preset only needs to supply the keys
// it differs on, and every omitted key inherits the data-theme CSS default.
//
// The set is no longer color-only: radius and font-family seeds are included so
// a future custom-theme editor can expose them alongside color tokens.
// `destructive` is the canonical red/status name — there are no `error`/`danger`
// color aliases; those words remain only as semantic/severity values in app code.

export type ThemeToken =
    | '--surface-app'
    | '--surface-panel'
    | '--surface-elevated'
    | '--surface-overlay-card'
    | '--content-primary'
    | '--content-emphasized'
    | '--content-secondary'
    | '--content-muted'
    | '--border-default'
    | '--user-accent'
    | '--interactive-text'
    | '--status-success'
    | '--status-destructive'
    | '--status-warning'
    | '--status-info'
    | '--overlay-backdrop'
    | '--overlay-backdrop-strong'
    | '--syntax-key'
    | '--syntax-string'
    | '--syntax-number'
    | '--syntax-boolean'
    | '--syntax-bracket'
    | '--state-selected-bg'
    | '--state-selected-text'
    | '--state-selected-border'
    | '--state-hover-bg'
    | '--state-active-bg'
    | '--state-active-text'
    | '--state-row-selected-bg'
    | '--state-row-selected-accent'
    | '--state-row-selected-solid-bg'
    | '--state-row-selected-solid-text'
    | '--state-cell-selected-bg'
    | '--state-cell-selected-border'
    | '--state-drag-over-bg'
    | '--state-drag-over-border'
    | '--radius-scale-sm'
    | '--radius-scale-md'
    | '--radius-scale-lg'
    | '--radius-scale-xl'
    | '--font-family-sans'
    | '--font-family-mono'
    | '--chart-1'
    | '--chart-2'
    | '--chart-3'
    | '--chart-4'
    | '--chart-5'
    | '--sidebar'
    | '--sidebar-foreground'
    | '--sidebar-primary'
    | '--sidebar-primary-foreground'
    | '--sidebar-accent'
    | '--sidebar-accent-foreground'
    | '--sidebar-border'
    | '--sidebar-ring'
    | '--btn-primary-bg'
    | '--btn-primary-bg-hover'
    | '--btn-primary-bg-active'
    | '--btn-primary-fg'
    | '--btn-secondary-bg'
    | '--btn-secondary-bg-hover'
    | '--btn-secondary-bg-active'
    | '--btn-secondary-fg'
    | '--btn-secondary-border'
    | '--btn-outline-fg'
    | '--btn-outline-border'
    | '--btn-outline-bg-hover'
    | '--btn-outline-bg-active'
    | '--btn-ghost-fg'
    | '--btn-ghost-bg-hover'
    | '--btn-ghost-bg-active'
    | '--btn-link-fg'
    | '--btn-link-fg-hover'
    | '--btn-destructive-bg'
    | '--btn-destructive-bg-hover'
    | '--btn-destructive-bg-active'
    | '--btn-destructive-fg'
    | '--btn-focus-ring'
    | '--btn-radius';

export const THEME_TOKENS: ThemeToken[] = [
    '--surface-app',
    '--surface-panel',
    '--surface-elevated',
    '--surface-overlay-card',
    '--content-primary',
    '--content-emphasized',
    '--content-secondary',
    '--content-muted',
    '--border-default',
    '--user-accent',
    '--interactive-text',
    '--status-success',
    '--status-destructive',
    '--status-warning',
    '--status-info',
    '--overlay-backdrop',
    '--overlay-backdrop-strong',
    '--syntax-key',
    '--syntax-string',
    '--syntax-number',
    '--syntax-boolean',
    '--syntax-bracket',
    '--state-selected-bg',
    '--state-selected-text',
    '--state-selected-border',
    '--state-hover-bg',
    '--state-active-bg',
    '--state-active-text',
    '--state-row-selected-bg',
    '--state-row-selected-accent',
    '--state-row-selected-solid-bg',
    '--state-row-selected-solid-text',
    '--state-cell-selected-bg',
    '--state-cell-selected-border',
    '--state-drag-over-bg',
    '--state-drag-over-border',
    '--radius-scale-sm',
    '--radius-scale-md',
    '--radius-scale-lg',
    '--radius-scale-xl',
    '--font-family-sans',
    '--font-family-mono',
    '--chart-1',
    '--chart-2',
    '--chart-3',
    '--chart-4',
    '--chart-5',
    '--sidebar',
    '--sidebar-foreground',
    '--sidebar-primary',
    '--sidebar-primary-foreground',
    '--sidebar-accent',
    '--sidebar-accent-foreground',
    '--sidebar-border',
    '--sidebar-ring',
    '--btn-primary-bg',
    '--btn-primary-bg-hover',
    '--btn-primary-bg-active',
    '--btn-primary-fg',
    '--btn-secondary-bg',
    '--btn-secondary-bg-hover',
    '--btn-secondary-bg-active',
    '--btn-secondary-fg',
    '--btn-secondary-border',
    '--btn-outline-fg',
    '--btn-outline-border',
    '--btn-outline-bg-hover',
    '--btn-outline-bg-active',
    '--btn-ghost-fg',
    '--btn-ghost-bg-hover',
    '--btn-ghost-bg-active',
    '--btn-link-fg',
    '--btn-link-fg-hover',
    '--btn-destructive-bg',
    '--btn-destructive-bg-hover',
    '--btn-destructive-bg-active',
    '--btn-destructive-fg',
    '--btn-focus-ring',
    '--btn-radius',
];

export interface MonacoThemeRule {
    token: string;
    /** Bare hex without '#'. Omit to restyle weight/slant only. */
    foreground?: string;
    fontStyle?: string;
}

export interface MonacoCustomTheme {
    base: 'vs' | 'vs-dark';
    inherit: boolean;
    rules: MonacoThemeRule[];
    colors: Record<string, string>;
}

export interface ThemePreset {
    id: string;
    label: string;
    /** Which data-theme family / Monaco base this preset rides on. */
    appearance: 'light' | 'dark';
    /** true for the four shipped presets; false for a future imported/custom theme. */
    builtIn: boolean;
    /** Only the tokens that differ from the data-theme CSS default — missing keys inherit it. */
    tokens: Partial<Record<ThemeToken, string>>;
    monaco: {
        /** Monaco theme name to activate — a built-in ('vs' | 'vs-dark') or a registered custom id. */
        id: string;
        /** Present only when `id` isn't a Monaco built-in and needs registering via defineTheme. */
        custom?: MonacoCustomTheme;
    };
}
