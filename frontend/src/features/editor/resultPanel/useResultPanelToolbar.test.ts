// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResultPanelAction } from './types';
import { ToolbarActionItem, resolveResultToolbarActionTone } from './useResultPanelToolbar';
import { getExecuteActionMeta } from '../../../lib/executeActionMeta';

describe('resolveResultToolbarActionTone', () => {
    it('prefers explicit danger and success semantics for result toolbar actions', () => {
        expect(
            resolveResultToolbarActionTone({
                id: 'delete-rows',
                label: 'Delete',
                danger: true,
            } as ResultPanelAction),
        ).toBe('destructive');

        expect(
            resolveResultToolbarActionTone({
                id: 'add-row',
                label: 'Add Row',
            } as ResultPanelAction),
        ).toBe('success');
    });

    it('keeps save actions on the default primary tone', () => {
        expect(
            resolveResultToolbarActionTone({
                id: 'save',
                label: 'Save',
            } as ResultPanelAction),
        ).toBe('default');
    });

    it('uses an explicit tone when one is provided', () => {
        expect(
            resolveResultToolbarActionTone({
                id: 'reload',
                label: 'Reload',
                tone: 'warning',
            } as ResultPanelAction),
        ).toBe('warning');
    });

    it('shares the execute button contract with the editor toolbar', () => {
        expect(getExecuteActionMeta('pro')).toEqual({
            variant: 'destructive',
            tone: 'default',
            confirmButtonClassName: 'env-action-pro',
            title: 'Execute on Production (Ctrl+Enter)',
            ariaLabel: 'Execute on Production',
            actionLabel: 'Execute on Production',
            progressLabel: 'Executing...',
        });

        expect(getExecuteActionMeta('sta')).toEqual({
            variant: 'ghost',
            tone: 'default',
            confirmButtonClassName: 'env-action-sta',
            title: 'Execute on Staging (Ctrl+Enter)',
            ariaLabel: 'Execute on Staging',
            actionLabel: 'Execute on Staging',
            progressLabel: 'Executing...',
        });
    });
});

describe('ToolbarActionItem inline confirm', () => {
    function makeAction(overrides: Partial<ResultPanelAction> = {}): ResultPanelAction {
        return {
            id: 'cancel-export',
            title: 'Cancel export',
            onClick: vi.fn(),
            ...overrides,
        } as ResultPanelAction;
    }

    it('runs onClick immediately when the action has no confirmLabel', () => {
        const action = makeAction({ confirmLabel: undefined });
        render(React.createElement(ToolbarActionItem, { action }));

        fireEvent.click(screen.getByTitle('Cancel export'));

        expect(action.onClick).toHaveBeenCalledTimes(1);
    });

    it('swaps to an inline confirm instead of running onClick, for any action with confirmLabel', () => {
        const action = makeAction({ confirmLabel: 'Cancel export?' });
        render(React.createElement(ToolbarActionItem, { action }));

        fireEvent.click(screen.getByTitle('Cancel export'));

        expect(action.onClick).not.toHaveBeenCalled();
        expect(screen.getByText('Cancel export?')).toBeInTheDocument();
    });

    it('only runs onClick once the inline confirm is accepted', () => {
        const action = makeAction({ confirmLabel: 'Cancel export?' });
        render(React.createElement(ToolbarActionItem, { action }));

        fireEvent.click(screen.getByTitle('Cancel export'));
        fireEvent.click(screen.getByTitle('Yes, cancel export'));

        expect(action.onClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Cancel export?')).not.toBeInTheDocument();
    });

    it('dismisses the inline confirm without running onClick when cancelled', () => {
        const action = makeAction({ confirmLabel: 'Cancel export?' });
        render(React.createElement(ToolbarActionItem, { action }));

        fireEvent.click(screen.getByTitle('Cancel export'));
        fireEvent.click(screen.getByTitle('Cancel'));

        expect(action.onClick).not.toHaveBeenCalled();
        expect(screen.queryByText('Cancel export?')).not.toBeInTheDocument();
        expect(screen.getByTitle('Cancel export')).toBeInTheDocument();
    });
});
