// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SpotlightDialog, SpotlightPanel } from './command';

function renderSpotlight() {
    const onOpenChange = vi.fn();
    render(
        <SpotlightDialog open onOpenChange={onOpenChange} title='Search' description='Search'>
            <SpotlightPanel>
                <button type='button'>inside</button>
            </SpotlightPanel>
        </SpotlightDialog>,
    );
    return onOpenChange;
}

describe('SpotlightDialog', () => {
    it('closes when the backdrop beside the panel is pressed', () => {
        const onOpenChange = renderSpotlight();
        fireEvent.pointerDown(screen.getByRole('dialog'));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open when the panel itself is pressed', () => {
        const onOpenChange = renderSpotlight();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'inside' }));
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
