// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectProfileDialog } from './ProjectProfileDialog';
import type { WizardDraftData } from './ProjectWizard.types';

vi.mock('./EnvironmentMatrix', () => ({
    EnvironmentMatrix: ({ onCreateConnection }: { onCreateConnection?: () => void }) => (
        <div data-testid='environment-matrix'>
            {onCreateConnection && (
                <button type='button' onClick={onCreateConnection}>
                    matrix: new connection
                </button>
            )}
        </div>
    ),
}));

vi.mock('./WizardStorageField', () => ({
    WizardStorageField: () => <div data-testid='wizard-storage-field' />,
}));

vi.mock('../../connection', () => ({
    ConnectionFormPanel: ({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) => (
        <div data-testid='connection-form-panel'>
            <button type='button' onClick={onSaved}>
                panel: save
            </button>
            <button type='button' onClick={onCancel}>
                panel: cancel
            </button>
        </div>
    ),
}));

// The real hook lazy-imports driver.js and drives a DOM tour — irrelevant to
// this component's own behavior and unsafe to run against jsdom in a unit test.
vi.mock('../../../features/onboarding/useProjectSetupTour', () => ({
    useProjectSetupTour: () => {},
}));

function makeDraft(overrides: Partial<WizardDraftData> = {}): WizardDraftData {
    return { name: 'My Project', description: '', iconKey: 'general', colorKey: '', ...overrides };
}

type Props = React.ComponentProps<typeof ProjectProfileDialog>;

function makeProps(overrides: Partial<Props> = {}): Props {
    return {
        mode: 'create',
        draft: makeDraft(),
        editProject: null,
        onDraftChange: vi.fn(),
        storageParentPath: '/projects',
        storagePath: '/projects/my-project',
        storagePathPreview: '/projects/my-project',
        loadingStorageRoot: false,
        pathConflictProject: null,
        onStorageChange: vi.fn(),
        onPickFolder: vi.fn(),
        connections: [],
        onSetActiveEnvKey: vi.fn(),
        draftEnvironmentBindings: {},
        onBind: vi.fn(),
        onUnbind: vi.fn(),
        connectionPanel: { onManageConnections: vi.fn() },
        submitting: false,
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
        ...overrides,
    };
}

describe('ProjectProfileDialog', () => {
    it('renders identity fields and the environment matrix in create mode', () => {
        render(<ProjectProfileDialog {...makeProps()} />);
        expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Optional description')).toBeInTheDocument();
        expect(screen.getByTestId('wizard-storage-field')).toBeInTheDocument();
        expect(screen.getByTestId('environment-matrix')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
    });

    it('shows "Save Changes" in edit mode', () => {
        render(<ProjectProfileDialog {...makeProps({ mode: 'edit' })} />);
        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    });

    it('disables submit when the name is empty', () => {
        render(<ProjectProfileDialog {...makeProps({ draft: makeDraft({ name: '' }) })} />);
        expect(screen.getByRole('button', { name: /Create Project/i })).toBeDisabled();
    });

    it('calls onDraftChange when the name input changes', () => {
        const onDraftChange = vi.fn();
        const draft = makeDraft({ name: '' });
        render(<ProjectProfileDialog {...makeProps({ draft, onDraftChange })} />);

        fireEvent.change(screen.getByPlaceholderText('My Project'), {
            target: { value: 'New Name' },
        });

        expect(onDraftChange).toHaveBeenCalledWith({ ...draft, name: 'New Name' });
    });

    it('calls onSubmit when the submit button is clicked', () => {
        const onSubmit = vi.fn();
        render(<ProjectProfileDialog {...makeProps({ onSubmit })} />);
        fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));
        expect(onSubmit).toHaveBeenCalled();
    });

    it('calls onCancel when the cancel button is clicked', () => {
        const onCancel = vi.fn();
        render(<ProjectProfileDialog {...makeProps({ onCancel })} />);
        fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
        expect(onCancel).toHaveBeenCalled();
    });

    it('offers inline connection creation even when the pool is non-empty', () => {
        render(
            <ProjectProfileDialog
                {...makeProps({
                    connections: [{ name: 'existing', driver: 'postgres' } as never],
                })}
            />,
        );
        expect(screen.getByRole('button', { name: 'matrix: new connection' })).toBeInTheDocument();
        expect(screen.queryByTestId('connection-form-panel')).not.toBeInTheDocument();
    });

    it('swaps to the connection form and back after save', () => {
        const onConnectionCreated = vi.fn();
        render(<ProjectProfileDialog {...makeProps({ onConnectionCreated })} />);

        fireEvent.click(screen.getByRole('button', { name: 'matrix: new connection' }));
        expect(screen.getByTestId('connection-form-panel')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Add a connection' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Create Project/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'panel: save' }));
        expect(onConnectionCreated).toHaveBeenCalled();
        expect(screen.queryByTestId('connection-form-panel')).not.toBeInTheDocument();
        expect(screen.getByTestId('environment-matrix')).toBeInTheDocument();
    });

    it('returns to the project view when the connection form is cancelled', () => {
        render(<ProjectProfileDialog {...makeProps()} />);
        fireEvent.click(screen.getByRole('button', { name: 'matrix: new connection' }));
        fireEvent.click(screen.getByRole('button', { name: 'panel: cancel' }));
        expect(screen.getByTestId('environment-matrix')).toBeInTheDocument();
        expect(screen.queryByTestId('connection-form-panel')).not.toBeInTheDocument();
    });
});
