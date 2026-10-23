// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectHub } from './ProjectHub';
import { ENVIRONMENT_KEY, ProjectHubLaunchContext, ProjectWizardMode } from '../../lib/constants';
import { markPrivacyNoticeAccepted } from '../../features/telemetry/privacyNotice';
import type { Project } from '../../types/project';

const mocks = vi.hoisted(() => {
    const toastError = vi.fn();
    const toastSuccess = vi.fn();
    return {
        createProject: vi.fn(),
        saveProject: vi.fn(),
        loadConnections: vi.fn(),
        getDefaultRoot: vi.fn(),
        pickDirectory: vi.fn(),
        connectProjectEnvironment: vi.fn(),
        disconnect: vi.fn(),
        resetRuntime: vi.fn(),
        setActiveEnvironment: vi.fn(),
        toastError,
        toastSuccess,
        // Stable object reference — prevents useCallback dep churn in ProjectWizard's loadConnections
        stableToast: { error: toastError, success: toastSuccess },
        useFeatureGate: vi.fn(),
        openUpgradeUrl: vi.fn(),
        openCheckoutOrUpgradeUrl: vi.fn(),
        getLicenseState: vi.fn().mockResolvedValue({ ok: true, data: { savedEmail: '' } }),
    };
});

const projectState = {
    projects: [] as Project[],
    isLoading: false,
    activeProject: null as Project | null,
    createProject: mocks.createProject,
    saveProject: mocks.saveProject,
    setActiveProject: vi.fn(),
    patchProject: vi.fn(),
    clearProjectActionError: vi.fn(),
    lastProjectActionError: null as { code?: string; message?: string } | null,
};

function makeProject(id: string, name: string, overrides: Partial<Project> = {}): Project {
    return {
        id,
        slug: name.toLowerCase(),
        name,
        description: '',
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        last_active_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        layout_state: '',
        environments: [],
        assets: [],
        storage_path: `C:/projects/${id}`,
        ...overrides,
    };
}

function makeGate(
    overrides: Partial<{
        hasFullAccess: boolean;
        projectLimit: number;
    }> = {},
) {
    return {
        hasFullAccess: false,
        projectLimit: 5,
        ...overrides,
        getProjectLimitAccess: () => ({
            state: 'enabled' as const,
            badgeLabel: 'Included',
            helperText: '',
        }),
        getProjectUsageLabel: () => '',
    };
}

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            disconnect: mocks.disconnect,
            loadConnections: mocks.loadConnections,
            testConnection: vi.fn(),
            saveConnection: vi.fn(),
            listConnectionImporters: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        },
        project: {
            getDefaultProjectStorageRoot: mocks.getDefaultRoot,
            pickDirectory: mocks.pickDirectory,
            connectProjectEnvironment: mocks.connectProjectEnvironment,
        },
    }),
}));

vi.mock('../../stores/projectStore', () => {
    const useProjectStore = (selector?: (state: typeof projectState) => unknown) =>
        selector ? selector(projectState) : projectState;
    useProjectStore.getState = () => projectState;
    return { useProjectStore };
});

vi.mock('../../stores/connectionStore', () => ({
    useConnectionStore: (selector: (state: { resetRuntime: () => void }) => unknown) =>
        selector({ resetRuntime: mocks.resetRuntime }),
}));

vi.mock('../../stores/environmentStore', () => ({
    useEnvironmentStore: (selector: (state: { setActiveEnvironment: () => void }) => unknown) =>
        selector({ setActiveEnvironment: mocks.setActiveEnvironment }),
}));

vi.mock('./Toast', () => ({
    useToast: () => ({ toast: mocks.stableToast }),
}));

vi.mock('../../lib/license/useFeatureGate', () => ({
    useFeatureGate: mocks.useFeatureGate,
}));

vi.mock('../../lib/license/service', () => ({
    openUpgradeUrl: mocks.openUpgradeUrl,
    openCheckoutOrUpgradeUrl: mocks.openCheckoutOrUpgradeUrl,
    getLicenseState: mocks.getLicenseState,
    isLicenseSyncAvailable: () => true,
}));

// The real hook lazy-imports driver.js and drives a DOM tour — irrelevant to
// these wizard/cap-logic tests and unsafe to run against jsdom in a unit test.
vi.mock('../../features/onboarding/useProjectSetupTour', () => ({
    useProjectSetupTour: () => {},
}));

describe('ProjectHub', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Most of these tests are about the wizard/cap logic, not the privacy
        // gate — pre-accept it so it doesn't shadow every create-mode render.
        // The gate itself is covered separately below.
        markPrivacyNoticeAccepted();
        projectState.projects = [];
        projectState.isLoading = false;
        projectState.activeProject = null;
        projectState.lastProjectActionError = null;
        mocks.useFeatureGate.mockReturnValue(makeGate());
        mocks.getDefaultRoot.mockResolvedValue({ ok: true, data: 'C:/projects' });
        mocks.loadConnections.mockResolvedValue({ ok: true, data: [] });
    });

    it('opens straight into create mode when there is no active project — no project list anymore', () => {
        render(<ProjectHub />);

        expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/Search projects/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^New$/i })).not.toBeInTheDocument();
    });

    it('opens straight into edit mode for the active project', () => {
        const project = makeProject('p1', 'Project One');
        projectState.projects = [project];
        projectState.activeProject = project;

        render(<ProjectHub />);

        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
        expect(screen.getByDisplayValue('Project One')).toBeInTheDocument();
    });

    it('honors an explicit edit launchIntent over the active project', () => {
        const active = makeProject('p1', 'Active Project');
        const other = makeProject('p2', 'Other Project');
        projectState.projects = [active, other];
        projectState.activeProject = active;

        render(
            <ProjectHub
                launchIntent={{
                    wizardMode: ProjectWizardMode.EDIT,
                    projectId: 'p2',
                    launchContext: ProjectHubLaunchContext.DEFAULT,
                }}
            />,
        );

        expect(screen.getByDisplayValue('Other Project')).toBeInTheDocument();
    });

    it('shows a loading state while the edit target project has not resolved yet', () => {
        projectState.isLoading = true;

        render(
            <ProjectHub
                launchIntent={{
                    wizardMode: ProjectWizardMode.EDIT,
                    projectId: 'ghost',
                    launchContext: ProjectHubLaunchContext.DEFAULT,
                }}
            />,
        );

        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows a not-found state when the edit target project no longer exists', () => {
        projectState.isLoading = false;

        render(
            <ProjectHub
                launchIntent={{
                    wizardMode: ProjectWizardMode.EDIT,
                    projectId: 'ghost',
                    launchContext: ProjectHubLaunchContext.DEFAULT,
                }}
            />,
        );

        expect(
            screen.getByText('Project not found. It may have been removed.'),
        ).toBeInTheDocument();
    });

    it('shows the upgrade dialog instead of the create form when at the free project cap', () => {
        projectState.projects = Array.from({ length: 5 }, (_, i) => makeProject(`p${i}`, `P${i}`));
        mocks.useFeatureGate.mockReturnValue(makeGate({ projectLimit: 5 }));

        render(<ProjectHub />);

        expect(
            screen.getByText(/You've reached the 5-project limit on the Free plan\./i),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Create Project/i })).not.toBeInTheDocument();
    });

    it('opens the upgrade dialog directly when the backend refused a new admission', () => {
        // FE count is under the cap (e.g. drift) but Open Project Folder was refused.
        mocks.useFeatureGate.mockReturnValue(makeGate({ projectLimit: 5 }));

        render(
            <ProjectHub
                launchIntent={{
                    wizardMode: ProjectWizardMode.CREATE,
                    showProjectLimitUpgrade: true,
                }}
            />,
        );

        expect(
            screen.getByText(/You've reached the 5-project limit on the Free plan\./i),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Create Project/i })).not.toBeInTheDocument();
    });

    it('does not gate edit mode behind the project cap', () => {
        const project = makeProject('p1', 'Project One');
        projectState.projects = Array.from({ length: 5 }, (_, i) => makeProject(`p${i}`, `P${i}`));
        projectState.projects[0] = project;
        projectState.activeProject = project;
        mocks.useFeatureGate.mockReturnValue(makeGate({ projectLimit: 5 }));

        render(<ProjectHub />);

        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    });

    it('calls onClose when the dialog is cancelled', () => {
        const onClose = vi.fn();
        render(<ProjectHub onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalled();
    });

    it('opens the create wizard directly without a privacy step (that gate lives in App)', () => {
        localStorage.clear();

        render(<ProjectHub />);

        expect(screen.queryByText('Before you get started')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
    });
});
