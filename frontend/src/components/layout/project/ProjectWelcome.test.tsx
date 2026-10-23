// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectWelcome } from './ProjectWelcome';
import { DOM_EVENT } from '../../../lib/constants';
import { ProjectWizardMode } from '../../../lib/enums';
import { onCommand } from '../../../lib/commandBus';

const mocks = vi.hoisted(() => ({ openProject: vi.fn() }));

const projectState = {
    projects: [] as Array<{ id: string; name: string; updated_at: string }>,
    recentProjectIds: [] as string[],
};

vi.mock('../../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
}));
vi.mock('../../../stores/shortcutStore', () => ({
    useShortcutStore: (selector: (state: { getBinding: () => string }) => unknown) =>
        selector({ getBinding: () => 'Ctrl+Alt+N' }),
}));
vi.mock('../../../hooks/useOpenProject', () => ({
    useOpenProject: () => ({ openProject: mocks.openProject }),
}));
vi.mock('../Toast', () => ({
    useToast: () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }),
}));

describe('ProjectWelcome', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectState.projects = [];
        projectState.recentProjectIds = [];
    });

    it('opens the create wizard from New Project', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_PROJECT_HUB, handler);
        render(<ProjectWelcome />);

        fireEvent.click(screen.getByText('New Project'));

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({ wizardMode: ProjectWizardMode.CREATE }),
            expect.anything(),
        );
        off();
    });

    it('emits OPEN_PROJECT_FOLDER from Open Project Folder', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_PROJECT_FOLDER, handler);
        render(<ProjectWelcome />);

        fireEvent.click(screen.getByText('Open Project Folder…'));

        expect(handler).toHaveBeenCalled();
        off();
    });

    it('lists recent projects first and opens one on click', () => {
        projectState.projects = [
            { id: 'a', name: 'Alpha', updated_at: '2026-03-01T00:00:00Z' },
            { id: 'b', name: 'Beta', updated_at: '2026-01-01T00:00:00Z' },
        ];
        projectState.recentProjectIds = ['b'];
        render(<ProjectWelcome />);

        const names = screen.getAllByText(/Alpha|Beta/).map(node => node.textContent);
        expect(names).toEqual(['Beta', 'Alpha']);

        fireEvent.click(screen.getByText('Beta'));
        expect(mocks.openProject).toHaveBeenCalledWith('b');
    });

    it('hides the Recent section when there are no projects', () => {
        render(<ProjectWelcome />);

        expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    });
});
