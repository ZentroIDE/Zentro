// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnvironmentBadge } from './EnvironmentBadge';

describe('EnvironmentBadge', () => {
    it('renders filled pill with mapped environment class', () => {
        render(<EnvironmentBadge label='DEV' />);
        const badge = screen.getByText('DEV');

        expect(badge).toHaveClass('inline-flex');
        expect(badge).toHaveClass('env-badge-dev');
        expect(badge).toHaveClass('rounded-sm');
    });

    it('maps full production label to production badge class', () => {
        render(<EnvironmentBadge label='Production' />);
        expect(screen.getByText('Production')).toHaveClass('env-badge-pro');
    });

    it('keeps original label text without transform', () => {
        render(<EnvironmentBadge label='dev' />);
        expect(screen.getByText('dev')).toBeInTheDocument();
    });

    it('falls back to provided tone class for unknown label', () => {
        render(
            <EnvironmentBadge
                label='custom'
                toneClassName='bg-destructive/11 text-destructive'
                className='ring-1'
            />,
        );
        const badge = screen.getByText('custom');

        expect(badge).toHaveClass('text-destructive');
        expect(badge).toHaveClass('bg-destructive/11');
        expect(badge).toHaveClass('ring-1');
    });
});
