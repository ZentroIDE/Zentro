// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './Progress';

describe('Progress', () => {
    it('renders a determinate bar with the given value', () => {
        render(<Progress value={42} label='Import progress' />);
        const bar = screen.getByRole('progressbar', { name: 'Import progress' });
        expect(bar).toHaveAttribute('aria-valuenow', '42');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
    });

    it('clamps out-of-range values to 0..100', () => {
        const { rerender } = render(<Progress value={150} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

        rerender(<Progress value={-20} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('omits aria-valuenow when indeterminate (no value/unknown total)', () => {
        render(<Progress />);
        expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    });

    it('falls back to a generic accessible label', () => {
        render(<Progress value={10} />);
        expect(screen.getByRole('progressbar', { name: 'Progress' })).toBeInTheDocument();
    });

    it('applies fillClassName on top of the tone-derived fill, for embedding on a colored background', () => {
        render(<Progress value={30} fillClassName='bg-background/90!' />);
        const fill = screen.getByRole('progressbar').firstElementChild;
        expect(fill).toHaveClass('bg-primary');
        expect(fill).toHaveClass('bg-background/90!');
    });

    it('applies fillClassName to the indeterminate fill too', () => {
        render(<Progress fillClassName='bg-background/90!' />);
        const fill = screen.getByRole('progressbar').firstElementChild;
        expect(fill).toHaveClass('progress-bar-indeterminate');
        expect(fill).toHaveClass('bg-background/90!');
    });
});
