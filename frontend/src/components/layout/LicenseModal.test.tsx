// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LicenseModal } from './LicenseModal';
import { createLicenseState } from '../../lib/license/types';
import { ToastProvider } from './Toast';

const { mockGetLicenseState } = vi.hoisted(() => ({
    mockGetLicenseState: vi.fn(),
}));

vi.mock('../../lib/license/service', () => ({
    openUpgradeUrl: vi.fn(),
    openCheckoutOrUpgradeUrl: vi.fn(),
    getLicenseState: mockGetLicenseState,
}));

function renderModal() {
    return render(
        <ToastProvider>
            <LicenseModal onClose={() => {}} />
        </ToastProvider>,
    );
}

describe('LicenseModal', () => {
    it('shows "Free plan", not "Pro unlocked", for an active Free-tier license', async () => {
        // status 'active' means the license record is valid, not that the
        // tier is Pro — a Free installation is "active" too. Regression
        // guard for a bug where the badge ignored tier entirely.
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({ status: 'active', tier: 'free' }),
        });

        renderModal();

        await waitFor(() => {
            expect(screen.getByText('Free plan')).toBeInTheDocument();
        });
        expect(screen.queryByText('Pro unlocked')).not.toBeInTheDocument();
    });

    it('shows "Pro unlocked" for an active Pro-tier license', async () => {
        mockGetLicenseState.mockResolvedValue({
            ok: true,
            data: createLicenseState({ status: 'active', tier: 'pro' }),
        });

        renderModal();

        await waitFor(() => {
            expect(screen.getByText('Pro unlocked')).toBeInTheDocument();
        });
    });
});
