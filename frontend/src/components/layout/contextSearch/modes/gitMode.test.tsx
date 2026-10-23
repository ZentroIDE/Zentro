// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from '../../../ui';
import { gitMode } from './gitMode';

const checkoutSpy = vi.fn().mockResolvedValue(undefined);
const loadSpy = vi.fn().mockResolvedValue(undefined);

let mockGitState: Record<string, unknown>;

vi.mock('../../../../stores/gitBranchStore', () => ({
    useGitBranchStore: (selector: (state: Record<string, unknown>) => unknown) =>
        selector(mockGitState),
}));

let mockActiveProject: { storage_path?: string } | null;

vi.mock('../../../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ activeProject: mockActiveProject }),
}));

vi.mock('../../Toast', () => ({
    useToast: () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }),
}));

const renderGitResults = (query: string, onClose = vi.fn()) => {
    render(
        <Command shouldFilter={false}>
            <gitMode.Results query={query} onClose={onClose} />
        </Command>,
    );
    return onClose;
};

describe('gitMode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActiveProject = { storage_path: 'C:/repo' };
        mockGitState = {
            branch: 'main',
            branches: ['main', 'dev'],
            loading: false,
            busy: false,
            load: loadSpy,
            checkout: checkoutSpy,
            createBranch: vi.fn().mockResolvedValue('created'),
            createBranchFrom: vi.fn().mockResolvedValue('created'),
            checkoutDetached: vi.fn().mockResolvedValue(undefined),
        };
    });

    it('renders action rows and the branch list with a current badge', () => {
        renderGitResults('');

        expect(screen.getByText('Create new branch...')).toBeInTheDocument();
        expect(screen.getByText(/Create new branch from/)).toBeInTheDocument();
        expect(screen.getByText('Checkout detached...')).toBeInTheDocument();
        expect(screen.getByText('main')).toBeInTheDocument();
        expect(screen.getByText('dev')).toBeInTheDocument();
        expect(screen.getByText('current')).toBeInTheDocument();
    });

    it('filters branches by the query', () => {
        renderGitResults('de');

        expect(screen.getByText('dev')).toBeInTheDocument();
        expect(screen.queryByText('main')).not.toBeInTheDocument();
    });

    it('checks out a branch on select and closes', async () => {
        const onClose = renderGitResults('');

        fireEvent.click(screen.getByText('dev'));

        await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith('dev'));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('shows an empty state without a git repository', () => {
        mockActiveProject = { storage_path: undefined };
        renderGitResults('');

        expect(screen.getByText('No git repository in this project.')).toBeInTheDocument();
        expect(screen.queryByText('Create new branch...')).not.toBeInTheDocument();
    });
});
