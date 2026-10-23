// SPDX-License-Identifier: GPL-3.0-only

import type React from 'react';

export interface UiAction {
    id: string;
    icon?: React.ReactNode;
    label?: string;
    title?: string;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
    danger?: boolean;
    /** When set, clicking the action first swaps it for an inline
     *  label + check/x acknowledgement (see ToolbarActionItem), instead of
     *  running onClick right away — the same pattern the result panel's
     *  Discard action uses, just generalized so other destructive toolbar
     *  actions (e.g. "Cancel export?") can opt in without a modal dialog. */
    confirmLabel?: string;
    render?: () => React.ReactNode;
    signature?: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'link';
    className?: string;
    badge?: React.ReactNode;
    popoverContent?: React.ReactNode;
    popoverOpen?: boolean;
    onPopoverOpenChange?: (open: boolean) => void;
}
