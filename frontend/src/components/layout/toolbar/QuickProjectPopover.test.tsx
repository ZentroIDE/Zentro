// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DOM_EVENT, ENVIRONMENT_KEY } from '../../../lib/constants';
import { emitCommand, onCommand } from '../../../lib/commandBus';
import { QuickProjectPopover } from './QuickProjectPopover';

const nortwind = {
    id: 'project-nortwind',
    name: 'Nortwind',
    description: 'Classic Northwind sample database',
    tags: ['pinned'],
    last_opened_at: '2026-08-26T09:00:00.000Z',
    updated_at: '2026-08-20T09:00:00.000Z',
    environments: [{ key: ENVIRONMENT_KEY.DEVELOPMENT }, { key: ENVIRONMENT_KEY.STAGING }],
};

const billing = {
    id: 'project-billing',
    name: 'Billing Service',
    description: '',
    tags: [],
    last_opened_at: '2026-08-19T09:00:00.000Z',
    updated_at: '2026-08-10T09:00:00.000Z',
    environments: [{ key: ENVIRONMENT_KEY.PRODUCTION }],
};

const patchProjectMock = vi.fn();
const deleteProjectMock = vi.fn(async () => true);

const projectState = {
    projects: [billing, nortwind],
    activeProject: nortwind,
    patchProject: patchProjectMock,
    deleteProject: deleteProjectMock,
};

const openProjectMock = vi.fn(async () => nortwind);
const openProjectInNewWindowMock = vi.fn(async (_id: string) => undefined);
const persistProjectMock = vi.fn(async (project: unknown) => project);
const openDirectoryInExplorerMock = vi.fn(async (_path: string) => ({ ok: true, data: null }));
const toastMock = { error: vi.fn(), success: vi.fn(), info: vi.fn() };

vi.mock('../../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
}));

vi.mock('../../../hooks/useOpenProject', () => ({
    useOpenProject: () => ({ openProject: openProjectMock }),
}));

vi.mock('../Toast', () => ({
    useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../services/project', () => ({
    ProjectServiceError: class ProjectServiceError extends Error {},
    openProjectInNewWindow: (id: string) => openProjectInNewWindowMock(id),
    persistProject: (project: unknown) => persistProjectMock(project),
}));

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        project: { openDirectoryInExplorer: openDirectoryInExplorerMock },
    }),
}));

async function openContextMenu(testId: string) {
    fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
    await screen.findByRole('dialog');
    fireEvent.contextMenu(screen.getByTestId(testId));
    return screen.findByRole('menu');
}

describe('QuickProjectPopover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the active project name on the trigger', () => {
        render(<QuickProjectPopover />);

        expect(screen.getByText('Nortwind')).toBeInTheDocument();
    });

    it('lists every project on hover, pinned project first', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));

        const popover = await screen.findByRole('dialog');
        const rows = within(popover).getAllByTestId(/^quick-switch-project-/);
        expect(rows.map(row => row.dataset.testid)).toEqual([
            'quick-switch-project-project-nortwind',
            'quick-switch-project-project-billing',
        ]);
        expect(within(popover).getByText('No description')).toBeInTheDocument();
    });

    it('opens a different project when its row is clicked', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        const popover = await screen.findByRole('dialog');

        fireEvent.click(within(popover).getByTestId('quick-switch-project-project-billing'));

        await waitFor(() => expect(openProjectMock).toHaveBeenCalledWith('project-billing'));
    });

    it('does not re-open the already-active project', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        const popover = await screen.findByRole('dialog');

        fireEvent.click(within(popover).getByTestId('quick-switch-project-project-nortwind'));

        expect(openProjectMock).not.toHaveBeenCalled();
    });

    it('filters the list by name and description', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        const popover = await screen.findByRole('dialog');

        fireEvent.change(screen.getByPlaceholderText('Search your project...'), {
            target: { value: 'billing' },
        });

        expect(within(popover).queryByText('Nortwind')).not.toBeInTheDocument();
        expect(within(popover).getByText('Billing Service')).toBeInTheDocument();
    });

    it('opens the popover when the QUICK_SWITCH_PROJECT command fires (Ctrl+P)', async () => {
        render(<QuickProjectPopover />);

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_PROJECT);
        });

        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('Billing Service')).toBeInTheDocument();
    });

    it('toggles the popover closed on a second QUICK_SWITCH_PROJECT command', async () => {
        render(<QuickProjectPopover />);

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_PROJECT);
        });
        await screen.findByRole('dialog');

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_PROJECT);
        });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('highlights the active project by default and moves highlight with arrow keys', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        const popover = await screen.findByRole('dialog');
        const searchInput = screen.getByPlaceholderText('Search your project...');

        expect(
            within(popover).getByTestId('quick-switch-project-project-nortwind'),
        ).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
        const billingRow = within(popover).getByTestId('quick-switch-project-project-billing');
        expect(billingRow).toHaveAttribute('aria-selected', 'true');
        // Regression guard: the highlighted row must carry a visible
        // background class, not just the aria attribute.
        expect(billingRow.className).toMatch(/bg-\(--state-hover-bg\)/);
        expect(
            within(popover).getByTestId('quick-switch-project-project-nortwind'),
        ).toHaveAttribute('aria-selected', 'false');

        // Wraps back around to the first row.
        fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
        expect(
            within(popover).getByTestId('quick-switch-project-project-nortwind'),
        ).toHaveAttribute('aria-selected', 'true');

        // Wraps the other way with ArrowUp.
        fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
        expect(within(popover).getByTestId('quick-switch-project-project-billing')).toHaveAttribute(
            'aria-selected',
            'true',
        );
    });

    it('opens the highlighted project on Enter', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        await screen.findByRole('dialog');
        const searchInput = screen.getByPlaceholderText('Search your project...');

        fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
        fireEvent.keyDown(searchInput, { key: 'Enter' });

        await waitFor(() => expect(openProjectMock).toHaveBeenCalledWith('project-billing'));
    });

    it('closes the popover on Escape', async () => {
        render(<QuickProjectPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Hover to quick switch/i));
        await screen.findByRole('dialog');
        const searchInput = screen.getByPlaceholderText('Search your project...');

        fireEvent.keyDown(searchInput, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    describe('row context menu', () => {
        it('right-click on a row opens the full project action menu', async () => {
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-billing');

            expect(within(menu).getByText('Open in new window')).toBeInTheDocument();
            expect(within(menu).getByText('Pin project')).toBeInTheDocument();
            expect(within(menu).getByText('Change icon')).toBeInTheDocument();
            expect(within(menu).getByText('Edit project')).toBeInTheDocument();
            expect(within(menu).getByText('Open in file explorer')).toBeInTheDocument();
            expect(within(menu).getByText('Delete project')).toBeInTheDocument();
        });

        it('shows "Unpin project" for an already-pinned project', async () => {
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-nortwind');

            expect(within(menu).getByText('Unpin project')).toBeInTheDocument();
            expect(within(menu).queryByText('Pin project')).not.toBeInTheDocument();
        });

        // NOTE: the "first outside click only dismisses the menu, it doesn't
        // fall through to the row underneath" guarantee comes from running the
        // ContextMenu in `modal` mode (Radix sets pointer-events:none on the
        // rest of the page while the menu is open). jsdom doesn't enforce
        // pointer-events, so that can't be asserted here — it's covered by the
        // `modal` prop on <ContextMenu> and by Radix's own suite.

        it('"Open in new window" delegates to the project service', async () => {
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-billing');
            fireEvent.click(within(menu).getByText('Open in new window'));

            await waitFor(() =>
                expect(openProjectInNewWindowMock).toHaveBeenCalledWith('project-billing'),
            );
        });

        it('"Pin project" optimistically patches then persists the pinned tag', async () => {
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-billing');
            fireEvent.click(within(menu).getByText('Pin project'));

            expect(patchProjectMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'project-billing',
                    tags: expect.arrayContaining(['pinned']),
                }),
            );
            await waitFor(() =>
                expect(persistProjectMock).toHaveBeenCalledWith(
                    expect.objectContaining({ tags: expect.arrayContaining(['pinned']) }),
                ),
            );
        });

        it('"Edit project" emits OPEN_PROJECT_HUB in edit mode for that project', async () => {
            const received: unknown[] = [];
            const off = onCommand(DOM_EVENT.OPEN_PROJECT_HUB, payload => received.push(payload));
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-billing');
            fireEvent.click(within(menu).getByText('Edit project'));
            off();

            expect(received).toContainEqual(
                expect.objectContaining({ wizardMode: 'edit', projectId: 'project-billing' }),
            );
        });

        it('"Delete project" opens a confirm dialog that calls the store on confirm', async () => {
            render(<QuickProjectPopover />);

            const menu = await openContextMenu('quick-switch-project-project-billing');
            fireEvent.click(within(menu).getByText('Delete project'));

            const dialog = await screen.findByRole('dialog');
            expect(
                within(dialog).getByText(/Delete "Billing Service" permanently\?/),
            ).toBeInTheDocument();

            fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

            await waitFor(() => expect(deleteProjectMock).toHaveBeenCalledWith('project-billing'));
        });
    });
});
