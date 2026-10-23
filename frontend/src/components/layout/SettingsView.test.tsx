// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import { SettingsView } from './SettingsView';
import { createLicenseState } from '../../lib/license/types';
import { registerBuiltInThemePresets } from '../../lib/theme/builtIn';

registerBuiltInThemePresets();

const {
    saveMock,
    addTabMock,
    toastSuccessMock,
    toastErrorMock,
    mockGetLicenseState,
    mockOpenUpgradeUrl,
    mockOpenCheckoutOrUpgradeUrl,
    mockRestoreLicenseByEmail,
    mockSetSavedLicenseEmail,
    settingsState,
    environmentState,
    projectState,
    saveProjectMock,
} = vi.hoisted(() => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saveProject = vi
        .fn()
        .mockImplementation(async (project: Record<string, unknown>) => project);
    return {
        saveMock: save,
        saveProjectMock: saveProject,
        addTabMock: vi.fn(),
        toastSuccessMock: vi.fn(),
        toastErrorMock: vi.fn(),
        mockGetLicenseState: vi.fn(),
        mockOpenUpgradeUrl: vi.fn(),
        mockOpenCheckoutOrUpgradeUrl: vi.fn(),
        mockRestoreLicenseByEmail: vi.fn(),
        mockSetSavedLicenseEmail: vi.fn(),
        settingsState: {
            theme: 'light',
            fontSize: 14,
            fontFamily: 'system',
            monoFamily: 'cascadia',
            themePresetLight: 'light-2026',
            themePresetDark: 'dark-2026',
            toastPlacement: 'bottom-left',
            connectTimeout: 10,
            queryTimeout: 60,
            environmentPolicies: {},
            setEnvironmentSafetyLevel: vi.fn().mockResolvedValue(undefined),
            save,
        },
        environmentState: {
            activeEnvironmentKey: 'dev', // ENVIRONMENT_KEY.DEVELOPMENT — raw value avoids TDZ inside vi.hoisted
        } as { activeEnvironmentKey: string },
        projectState: {
            activeProject: {
                id: 'p1',
                name: 'Project 1',
                storage_path: 'C:/repo/demo',
                auto_commit_on_exit: false,
            },
            saveProject,
        } as {
            activeProject: {
                id: string;
                name: string;
                storage_path: string;
                auto_commit_on_exit: boolean;
            } | null;
            saveProject: typeof saveProject;
        },
    };
});

vi.mock('../../lib/license/service', () => ({
    LICENSE_STATE_CHANGED_EVENT: 'zentro:license-state-changed',
    getLicenseState: mockGetLicenseState,
    restoreLicenseByEmail: mockRestoreLicenseByEmail,
    setSavedLicenseEmail: mockSetSavedLicenseEmail,
    openUpgradeUrl: mockOpenUpgradeUrl,
    openCheckoutOrUpgradeUrl: mockOpenCheckoutOrUpgradeUrl,
    isLicenseSyncAvailable: () => true,
    refreshLicense: vi.fn(),
}));

vi.mock('../../stores/settingsStore', () => ({
    useSettingsStore: Object.assign(
        (selector?: (state: typeof settingsState) => unknown) => {
            if (selector) return selector(settingsState);
            return settingsState;
        },
        { getState: () => settingsState },
    ),
}));

vi.mock('../../stores/editorStore', () => ({
    useEditorStore: Object.assign(
        () => ({
            addTab: addTabMock,
        }),
        { getState: () => ({ groups: [] }) },
    ),
}));

vi.mock('../../stores/environmentStore', () => ({
    useEnvironmentStore: (selector?: (state: typeof environmentState) => unknown) => {
        if (selector) return selector(environmentState);
        return environmentState;
    },
}));

vi.mock('../../stores/projectStore', () => ({
    useProjectStore: (selector?: (state: typeof projectState) => unknown) => {
        if (selector) return selector(projectState);
        return projectState;
    },
}));

vi.mock('./Toast', () => ({
    useToast: () => ({
        toast: {
            success: toastSuccessMock,
            error: toastErrorMock,
        },
    }),
}));

vi.mock('../../lib/profilePackage', () => ({
    applyProfilePackage: vi.fn().mockResolvedValue(undefined),
    buildCurrentProfilePackage: vi.fn(() => ({
        metadata: { name: 'Zentro Profile' },
    })),
    downloadProfilePackage: vi.fn(),
    parseProfilePackage: vi.fn(),
}));

vi.mock('../../../wailsjs/go/models', () => ({
    utils: {
        Preferences: class Preferences {
            constructor(init: Record<string, unknown>) {
                Object.assign(this, init);
            }
        },
    },
}));

describe('SettingsView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'active',
                tier: 'pro',
                trial: {
                    active: true,
                    ended: false,
                    daysRemaining: 21,
                },
            }),
        });
        mockRestoreLicenseByEmail.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'active',
                tier: 'pro',
            }),
        });
        mockSetSavedLicenseEmail.mockResolvedValue({
            ok: true,
            data: createLicenseState(),
        });
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.DEVELOPMENT;
        projectState.activeProject = {
            id: 'p1',
            name: 'Project 1',
            storage_path: 'C:/repo/demo',
            auto_commit_on_exit: false,
        };
    });

    it('filters sections by search query', async () => {
        render(<SettingsView tabId='settings-tab' />);
        await act(async () => Promise.resolve());

        expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'notif' },
        });

        expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Appearance' })).not.toBeInTheDocument();
    }, 15000);

    it('commits the preset and its light/dark family in one immediate save', async () => {
        vi.useFakeTimers();
        try {
            render(<SettingsView tabId='settings-tab' />);

            const themeTrigger = screen.getAllByRole('combobox')[0];
            if (!(themeTrigger instanceof HTMLButtonElement)) {
                throw new Error('Theme selector trigger is missing');
            }
            fireEvent.click(themeTrigger);
            fireEvent.click(screen.getByRole('option', { name: 'Zentro Dark' }));

            // The first click must persist BOTH the preset and theme: 'dark' so
            // the DOM re-themes right away — not after the 500ms form debounce.
            expect(saveMock).toHaveBeenCalledTimes(1);
            const payload = saveMock.mock.calls[0]?.[0] as {
                theme?: string;
                theme_preset_dark?: string;
            };
            expect(payload.theme).toBe('dark');
            expect(payload.theme_preset_dark).toBe('dark-2026');
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses compact single-column section styling', () => {
        const { container } = render(<SettingsView tabId='settings-tab' />);
        const section = screen.getByRole('heading', { name: 'Appearance' }).closest('div');
        expect(section?.className).not.toContain('lg:grid-cols-12');
        expect(container.querySelector('.lg\\:col-span-4')).toBeNull();
        expect(container.querySelector('.lg\\:col-span-8')).toBeNull();
    });

    it('applies write safety level via the backend policy store and locks production', async () => {
        const view = render(<SettingsView tabId='settings-tab' />);
        await act(async () => Promise.resolve());
        fireEvent.click(screen.getByRole('button', { name: 'Data & Query' }));

        const getSafetyTrigger = () => {
            const trigger = screen
                .getAllByRole('combobox')
                .find(element => /balanced|relaxed|strict/i.test(element.textContent || ''));
            if (!(trigger instanceof HTMLButtonElement)) {
                throw new Error('Write safety trigger is not rendered correctly');
            }
            return trigger;
        };

        // No backend policies loaded yet — dev falls back to balanced, editable.
        expect(getSafetyTrigger()).toHaveTextContent(/balanced/i);
        expect(getSafetyTrigger()).not.toBeDisabled();

        fireEvent.click(getSafetyTrigger());
        fireEvent.click(screen.getByRole('option', { name: 'Relaxed' }));
        expect(settingsState.setEnvironmentSafetyLevel).toHaveBeenCalledWith('dev', 'relaxed');

        // Production: safety floor — always strict, control locked.
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.PRODUCTION;
        view.rerender(<SettingsView tabId='settings-tab' />);
        expect(getSafetyTrigger()).toHaveTextContent(/strict/i);
        expect(getSafetyTrigger()).toBeDisabled();

        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.DEVELOPMENT;
        view.rerender(<SettingsView tabId='settings-tab' />);
        expect(toastSuccessMock).not.toHaveBeenCalled();
    }, 15000);

    it('disables auto-commit toggle when no active project or missing repo path', () => {
        projectState.activeProject = null;
        const first = render(<SettingsView tabId='settings-tab' />);
        fireEvent.click(screen.getByRole('button', { name: 'Source Control' }));
        expect(screen.getByRole('switch', { name: 'Auto commit on app exit' })).toBeDisabled();
        first.unmount();

        projectState.activeProject = {
            id: 'p2',
            name: 'Project 2',
            storage_path: '',
            auto_commit_on_exit: false,
        };
        render(<SettingsView tabId='settings-tab' />);
        fireEvent.click(screen.getByRole('button', { name: 'Source Control' }));
        expect(screen.getByRole('switch', { name: 'Auto commit on app exit' })).toBeDisabled();
    });

    it('saves active project auto_commit_on_exit when toggled', async () => {
        render(<SettingsView tabId='settings-tab' />);
        fireEvent.click(screen.getByRole('button', { name: 'Source Control' }));
        const toggle = screen.getByRole('switch', {
            name: 'Auto commit on app exit',
        });
        fireEvent.click(toggle);

        await act(async () => Promise.resolve());
        expect(saveProjectMock).toHaveBeenCalledTimes(1);
        expect(saveProjectMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'p1',
                auto_commit_on_exit: true,
            }),
        );
    });

    it('shows license state in settings and can find it via search', async () => {
        render(<SettingsView tabId='settings-tab' />);

        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'trial' },
        });

        expect(
            await screen.findByText(/Pro trial active - 21 days remaining/i),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View License/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
    });

    it('offers an Upgrade to Pro button on the free plan that opens checkout or the upgrade URL', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        });

        render(<SettingsView tabId='settings-tab' />);
        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'license' },
        });
        const upgradeButton = await screen.findByRole('button', { name: /Upgrade to Pro/i });
        fireEvent.click(upgradeButton);

        expect(mockOpenCheckoutOrUpgradeUrl).toHaveBeenCalled();
    });

    it('sanitizes connection errors and lets the user retry license status', async () => {
        mockGetLicenseState.mockResolvedValueOnce({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        });
        mockGetLicenseState.mockResolvedValueOnce({
            ok: false,
            error: {
                code: 'license.state.failed',
                message:
                    'Post "http://localhost:8080/api/v1/app/license/status": dial tcp [::1]:8080: connectex: No connection could be made because the target machine actively refused it.',
            },
        });
        mockGetLicenseState.mockResolvedValueOnce({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        });

        render(<SettingsView tabId='settings-tab' />);
        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'license' },
        });
        await act(async () => Promise.resolve());

        expect(await screen.findByRole('button', { name: /Retry/i })).toBeInTheDocument();
        expect(screen.getByText(/License server cannot connect right now\./i)).toBeInTheDocument();
        expect(screen.getByText(/localhost:8080/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

        await act(async () => Promise.resolve());
        expect(mockGetLicenseState).toHaveBeenCalledTimes(3);
    });

    it('shows restore email form for free users and restores license to the device', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
            }),
        });

        render(<SettingsView tabId='settings-tab' />);
        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'license' },
        });

        const input = await screen.findByPlaceholderText('you@example.com');
        fireEvent.change(input, {
            target: { value: 'restored@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Restore license/i }));

        await act(async () => Promise.resolve());
        expect(mockRestoreLicenseByEmail).toHaveBeenCalledWith('restored@example.com');
        expect(toastSuccessMock).toHaveBeenCalledWith('License restored for this device.');
    });

    it('hydrates and saves the license email independently of activation', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'inactive',
                tier: 'free',
                savedEmail: 'saved@example.com',
            }),
        });
        mockSetSavedLicenseEmail.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'active',
                tier: 'pro',
                savedEmail: 'next@example.com',
            }),
        });

        render(<SettingsView tabId='settings-tab' />);
        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'license' },
        });

        const input = await screen.findByPlaceholderText('you@example.com');
        await waitFor(() => expect(input).toHaveValue('saved@example.com'));

        fireEvent.change(input, {
            target: { value: 'Next@Example.com' },
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Save email/i }));
        });

        expect(mockSetSavedLicenseEmail).toHaveBeenCalledWith('Next@Example.com');
        expect(toastSuccessMock).toHaveBeenCalledWith('License email saved for this installation.');
        expect(await screen.findByText(/Pro is active on this installation/i)).toBeInTheDocument();
    }, 15000);

    it('shows active Pro messaging while keeping the email field visible', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({
                status: 'active',
                tier: 'pro',
                savedEmail: 'pro@example.com',
            }),
        });

        render(<SettingsView tabId='settings-tab' />);
        fireEvent.change(screen.getByPlaceholderText('Search settings...'), {
            target: { value: 'license' },
        });

        expect(await screen.findByText(/Pro is active on this installation/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('pro@example.com');
        expect(screen.getByRole('button', { name: /Save email/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Upgrade to Pro/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Restore license/i })).not.toBeInTheDocument();
    });
});
