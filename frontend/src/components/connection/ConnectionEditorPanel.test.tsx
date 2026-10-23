// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ConnectionEditorPanel } from './ConnectionEditorPanel';
import { DRIVER } from '../../lib/constants';
import type { UseConnectionFormReturn } from '../../hooks/useConnectionForm';

// The real hook lazy-imports driver.js and drives a DOM tour — irrelevant to
// this component's own behavior and unsafe to run against jsdom in a unit test.
vi.mock('../../features/onboarding/useConnectionFormTour', () => ({
    useConnectionFormTour: () => {},
}));

function makeForm(overrides: Partial<UseConnectionFormReturn> = {}): UseConnectionFormReturn {
    return {
        formData: { driver: DRIVER.POSTGRES, host: 'localhost', port: 5432 },
        connString: '',
        testing: false,
        saving: false,
        testResult: 'idle',
        errorMsg: '',
        successMsg: '',
        isEditing: false,
        selectedProvider: DRIVER.POSTGRES,
        handleDriverChange: vi.fn(),
        handleChange: vi.fn(),
        handleParseConnectionString: vi.fn(),
        handleTest: vi.fn(),
        handleSave: vi.fn(),
        resetFeedback: vi.fn(),
        resetForm: vi.fn(),
        setFormFromProfile: vi.fn(),
        ...overrides,
    };
}

describe('ConnectionEditorPanel', () => {
    it('shows the selected provider identity and the credentials form', () => {
        render(<ConnectionEditorPanel form={makeForm()} onCancel={vi.fn()} />);
        expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
        expect(screen.getByPlaceholderText('localhost')).toBeInTheDocument();
    });

    it('picks a driver from the "Change provider" dropdown', () => {
        const handleDriverChange = vi.fn();
        render(
            <ConnectionEditorPanel form={makeForm({ handleDriverChange })} onCancel={vi.fn()} />,
        );

        fireEvent.click(screen.getByRole('combobox', { name: 'Change provider' }));
        fireEvent.click(screen.getByRole('option', { name: /MySQL/i }));

        expect(handleDriverChange).toHaveBeenCalledWith(DRIVER.MYSQL);
    });

    it('disables the provider dropdown when editing an existing connection', () => {
        render(<ConnectionEditorPanel form={makeForm({ isEditing: true })} onCancel={vi.fn()} />);
        expect(screen.getByRole('combobox', { name: 'Change provider' })).toBeDisabled();
    });

    it('reflects the saved driver in the identity column when editing', () => {
        render(
            <ConnectionEditorPanel
                form={makeForm({
                    isEditing: true,
                    selectedProvider: DRIVER.MYSQL,
                    formData: { driver: DRIVER.MYSQL },
                })}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText('Popular open-source RDBMS')).toBeInTheDocument();
    });

    it('renders the edit-mode banner above the form', () => {
        render(
            <ConnectionEditorPanel
                form={makeForm({ isEditing: true })}
                banner={<p>credentials warning</p>}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText('credentials warning')).toBeInTheDocument();
    });

    it('wires the form Cancel button to onCancel', () => {
        const onCancel = vi.fn();
        render(<ConnectionEditorPanel form={makeForm()} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalled();
    });
});
