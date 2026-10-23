// SPDX-License-Identifier: GPL-3.0-only

import { cn } from '@/lib/cn';

export type ComponentTone = 'default' | 'neutral' | 'success' | 'warning' | 'destructive' | 'info';
export type ComponentState = 'default' | 'loading' | 'error' | 'disabled';
export type ComponentDensity = 'compact' | 'comfortable' | 'spacious';

export type ControlSize = 'default' | 'micro';
export type LegacyControlSize = 'sm' | 'md';
export type ControlSizeInput = ControlSize | LegacyControlSize;
export type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'link';
export type ButtonTone = 'default' | 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export const CONTROL_SIZE_CLASS: Record<ControlSize, string> = {
    default:
        '[height:var(--control-height-default)] [padding-left:var(--control-px-default)] [padding-right:var(--control-px-default)] ui-text-small font-normal leading-none',
    micro: '[height:var(--control-height-micro)] [padding-left:var(--control-px-micro)] [padding-right:var(--control-px-micro)] ui-text-small font-normal leading-none',
};

export const CLICKABLE_FOCUS_CLASS =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';
export const BUTTON_FOCUS_CLASS =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--btn-focus-ring) focus-visible:ring-offset-1 focus-visible:ring-offset-background';
export const TEXT_ENTRY_FOCUS_CLASS =
    'focus-visible:outline-none focus-visible:border-primary/65 focus-visible:ring-0 focus-visible:ring-offset-0';
export const interactiveSurface = 'ui-interactive-surface';
export const interactiveSelectable = 'ui-interactive-selectable';
export const interactiveSelected = 'ui-interactive-selected';
export const interactiveActive = 'ui-interactive-active';
export const interactiveIconAction = 'ui-interactive-icon-action';
export const interactiveDestructive = 'ui-interactive-destructive';
export const interactiveSuccess = 'ui-interactive-success';
export const interactiveInfo = 'ui-interactive-info';
export const interactiveGhostDestructive = 'ui-interactive-ghost-destructive';
export const interactiveGhostSuccess = 'ui-interactive-ghost-success';
export const interactiveGhostWarning = 'ui-interactive-ghost-warning';
export const interactiveGhostInfo = 'ui-interactive-ghost-info';
export const interactiveBadge = 'ui-interactive-badge';
export const interactiveReadOnly = 'ui-interactive-readonly';
export const interactiveTransparentHover = 'ui-interactive-transparent-hover';
export const interactiveTabTrigger = 'ui-interactive-tab-trigger';
export const interactiveMenuItem = 'ui-interactive-menu-item';
export const interactiveMenuItemDestructive = 'ui-interactive-menu-item-destructive';
/** Denser row sizing for menu items in compact contexts (toolbar/grid context menus). */
export const menuItemCompactClass = 'h-7 px-2 py-0 leading-none';
export const interactiveCommandItem = 'ui-interactive-command-item';
export const interactiveTableRow = 'ui-interactive-table-row';
export const interactiveGhostField = 'ui-interactive-ghost-field';
export const interactiveCheckedControl = 'ui-interactive-checked-control';
export const controlSurface = 'ui-control-surface';
export const controlEmphasis = 'ui-control-emphasis';
export const controlOutline = 'ui-control-outline';
export const controlGhost = 'ui-control-ghost';
export const controlDestructive = 'ui-control-destructive';
export const controlSuccess = 'ui-control-success';
export const controlWarning = 'ui-control-warning';
export const controlInfo = 'ui-control-info';
export const controlLink = 'ui-control-link';
export const buttonEmphasis = 'ui-btn-emphasis';
export const buttonSurface = 'ui-btn-surface';
export const buttonOutline = 'ui-btn-outline';
export const buttonGhost = 'ui-btn-ghost';
export const buttonLink = 'ui-btn-link';
export const buttonDestructive = 'ui-btn-destructive';

/**
 * Editor-style tab strip: dim tabs on a `bg-card` bar; the active one goes full
 * opacity and picks up `--tab-active-bg`, a surface tuned to stay distinct from
 * the bar in every theme (plain `--surface-app` collapses to `--card` on the
 * light presets). Shared verbatim by the main editor tab bar, the
 * result/bottom-panel tab bar, and the primary-sidebar Log panel so all three
 * read as one component. Callers append their own radius — `rounded-t-md` when
 * content sits directly below the strip, `rounded-md` when it stands alone.
 */
export const TAB_STRIP_BAR_CLASS = 'flex gap-1 items-center bg-card h-9 shrink-0 overflow-hidden';
export const TAB_STRIP_ITEM_CLASS =
    'group flex items-center h-full gap-1 px-2 cursor-pointer text-small! opacity-40! hover:opacity-100! hover:bg-(--state-hover-bg) select-none whitespace-nowrap transition-colors mb-0 shrink-0';
// text-(--interactive-text), not text-primary/--interactive-primary: on
// Solarized Dark --interactive-primary is a dark navy meant for button FILLS
// with white text on top, not for text painted directly on --tab-active-bg —
// using it here made the active tab label blend into its own background.
export const TAB_STRIP_ITEM_ACTIVE_CLASS =
    'bg-(--tab-active-bg) text-(--interactive-text) -mb-px opacity-100!';

export const normalizeControlSize = (size?: ControlSizeInput): ControlSize => {
    if (!size) return 'default';
    if (size === 'micro') return 'micro';
    return 'default';
};

export interface DesignSystemControlProps {
    tone?: ComponentTone;
    state?: ComponentState;
    density?: ComponentDensity;
}

// Density is applied via data-density attribute on :root - no per-component class needed.
export const DENSITY_CLASS: Record<ComponentDensity, string> = {
    compact: '',
    comfortable: '',
    spacious: '',
};

export const TONE_CLASS: Record<ComponentTone, string> = {
    default: '',
    neutral: '',
    success:
        'data-[tone=success]:border-success/55 data-[tone=success]:text-success data-[ui-tone=success]:border-success/55 data-[ui-tone=success]:text-success',
    warning:
        'data-[tone=warning]:border-warning/55 data-[tone=warning]:text-warning data-[ui-tone=warning]:border-warning/55 data-[ui-tone=warning]:text-warning',
    destructive:
        'data-[tone=destructive]:border-destructive/55 data-[tone=destructive]:text-destructive data-[ui-tone=destructive]:border-destructive/55 data-[ui-tone=destructive]:text-destructive',
    info: 'data-[tone=info]:border-info/55 data-[tone=info]:text-info data-[ui-tone=info]:border-info/55 data-[ui-tone=info]:text-info',
};

export const BUTTON_TONE_CLASS: Record<ButtonVariant, Partial<Record<ButtonTone, string>>> = {
    default: {
        default: controlEmphasis,
        neutral: controlSurface,
        success: controlSuccess,
        warning: controlWarning,
        destructive: controlDestructive,
        info: controlInfo,
    },
    secondary: {
        success: cn(controlSurface, interactiveSuccess),
        warning: cn(controlSurface, 'ui-interactive-warning'),
        destructive: cn(controlSurface, interactiveDestructive),
        info: cn(controlSurface, interactiveInfo),
    },
    outline: {
        success: cn(controlOutline, interactiveSuccess),
        warning: cn(controlOutline, 'ui-interactive-warning'),
        destructive: cn(controlOutline, interactiveDestructive),
        info: cn(controlOutline, interactiveInfo),
    },
    ghost: {
        success: cn(controlGhost, interactiveGhostSuccess),
        warning: cn(controlGhost, interactiveGhostWarning),
        destructive: cn(controlGhost, interactiveGhostDestructive),
        info: cn(controlGhost, interactiveGhostInfo),
    },
    link: {
        success: cn(controlLink, interactiveSuccess),
        warning: cn(controlLink, 'ui-interactive-warning'),
        destructive: cn(controlLink, interactiveDestructive),
        info: cn(controlLink, interactiveInfo),
    },
};

export const STATE_CLASS: Record<ComponentState, string> = {
    default: '',
    loading:
        'data-[state=loading]:pointer-events-none data-[state=loading]:opacity-80 data-[ui-state=loading]:pointer-events-none data-[ui-state=loading]:opacity-80',
    error: 'data-[state=error]:border-destructive data-[state=error]:ring-2 data-[state=error]:ring-destructive/30 data-[ui-state=error]:border-destructive data-[ui-state=error]:ring-2 data-[ui-state=error]:ring-destructive/30',
    disabled:
        'data-[state=disabled]:pointer-events-none data-[state=disabled]:opacity-50 data-[ui-state=disabled]:pointer-events-none data-[ui-state=disabled]:opacity-50',
};
