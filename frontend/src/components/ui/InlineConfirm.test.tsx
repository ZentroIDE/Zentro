// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineConfirm } from './InlineConfirm';

describe('InlineConfirm', () => {
    it('renders the label and calls onConfirm when the check button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <InlineConfirm
                label='Force kill this job?'
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );

        expect(screen.getByText('Force kill this job?')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Yes'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when the x button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<InlineConfirm label='Cancel export?' onConfirm={onConfirm} onCancel={onCancel} />);

        fireEvent.click(screen.getByTitle('Cancel'));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('disables both buttons while confirming', () => {
        render(
            <InlineConfirm
                label='Cancel export?'
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
                confirming
            />,
        );

        expect(screen.getByTitle('Yes')).toBeDisabled();
        expect(screen.getByTitle('Cancel')).toBeDisabled();
    });

    it('uses custom confirm/cancel titles when given', () => {
        render(
            <InlineConfirm
                label='Terminate session 18231?'
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
                confirmTitle='Yes, terminate'
                cancelTitle='Keep session'
            />,
        );

        expect(screen.getByTitle('Yes, terminate')).toBeInTheDocument();
        expect(screen.getByTitle('Keep session')).toBeInTheDocument();
    });
});
