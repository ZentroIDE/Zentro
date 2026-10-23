// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsLicense } from './SettingsLicense';
import { createLicenseState } from '../../../lib/license/types';

describe('SettingsLicense', () => {
    it('sanitizes raw connection errors and triggers retry', () => {
        const onRetry = vi.fn();

        render(
            <SettingsLicense
                licenseState={createLicenseState({
                    status: 'error',
                    tier: 'free',
                    policy: {
                        requireOnlineRefresh: true,
                        refreshIntervalMinutes: 30,
                    },
                    urls: {},
                    lastError:
                        'Post "http://localhost:8080/api/v1/app/license/status": dial tcp [::1]:8080: connectex: No connection could be made because the target machine actively refused it.',
                })}
                loading={false}
                onOpenLicense={() => {}}
                onRetry={onRetry}
                retrying={false}
                canRetry
                licenseEmail=''
                onLicenseEmailChange={() => {}}
                onSaveEmail={() => {}}
            />,
        );

        expect(screen.getByText(/License server cannot connect right now\./i)).toBeInTheDocument();
        expect(screen.getByText(/localhost:8080/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
