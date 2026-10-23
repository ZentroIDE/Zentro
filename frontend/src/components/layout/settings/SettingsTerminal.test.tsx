// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SettingsTerminal } from './SettingsTerminal';

describe('SettingsTerminal', () => {
    it('reflects whether the terminal is enabled and reports changes', () => {
        const onEnabledChange = vi.fn();
        render(<SettingsTerminal enabled={false} onEnabledChange={onEnabledChange} />);

        const toggle = screen.getByRole('switch', { name: 'Enable terminal' });
        expect(toggle).not.toBeChecked();

        fireEvent.click(toggle);
        expect(onEnabledChange).toHaveBeenCalledWith(true);
    });

    it('warns that a terminal has the user’s full rights', () => {
        render(<SettingsTerminal enabled onEnabledChange={vi.fn()} />);
        expect(screen.getByText(/full rights/)).toBeInTheDocument();
    });
});
