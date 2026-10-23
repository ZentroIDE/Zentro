// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnsavedChangesBanner } from './UnsavedChangesBanner';

describe('UnsavedChangesBanner', () => {
    it('renders inline save/discard actions with the labels it is given', () => {
        render(
            <UnsavedChangesBanner
                open
                saving={false}
                saveLabel='Save & Close'
                discardLabel='Discard & Close'
                onKeepEditing={vi.fn()}
                onSave={vi.fn()}
                onDiscard={vi.fn()}
            />,
        );

        expect(screen.getByText('Save your changes?')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save & Close' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Discard & Close' })).toBeInTheDocument();
    });

    it('wires each button to its own handler', () => {
        const onSave = vi.fn();
        const onDiscard = vi.fn();
        const onKeepEditing = vi.fn();
        render(
            <UnsavedChangesBanner
                open
                saving={false}
                saveLabel='Save & Reload'
                discardLabel='Discard'
                onKeepEditing={onKeepEditing}
                onSave={onSave}
                onDiscard={onDiscard}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Save & Reload' }));
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onDiscard).toHaveBeenCalledTimes(1);
        expect(onKeepEditing).toHaveBeenCalledTimes(1);
    });

    it('disables the actions and shows progress while saving', () => {
        render(
            <UnsavedChangesBanner
                open
                saving
                saveLabel='Save & Run'
                discardLabel='Discard'
                onKeepEditing={vi.fn()}
                onSave={vi.fn()}
                onDiscard={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
    });
});
