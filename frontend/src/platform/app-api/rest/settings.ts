// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { SettingsAdapter } from '../contracts/settings';
import type { RestHttpClient } from './httpClient';
import type { app, utils } from '../../../../wailsjs/go/models';

export function createSettingsRestAdapter(client: RestHttpClient): SettingsAdapter {
    return withKernelResult('settings', {
        getPreferences: () => client.call<utils.Preferences>('/settings/get-preferences'),
        setPreferences: (preferences: utils.Preferences) =>
            client.call<void>('/settings/set-preferences', { preferences }),
        checkForUpdates: () => client.call<app.UpdateInfo>('/settings/check-for-updates'),
        getAboutInfo: () => client.call<app.AboutInfo>('/settings/get-about-info'),
        getEnvironmentPolicies: () =>
            client.call<Record<string, app.ExecutionPolicy>>('/settings/get-environment-policies'),
        setEnvironmentSafetyLevel: (environmentKey: string, level: string) =>
            client.call<Record<string, app.ExecutionPolicy>>(
                '/settings/set-environment-safety-level',
                { environmentKey, level },
            ),
        shouldPromptForFeedback: () => client.call<boolean>('/settings/should-prompt-for-feedback'),
        markFeedbackPrompted: () => client.call<void>('/settings/mark-feedback-prompted'),
        submitFeedback: (rating: number, comment: string) =>
            client.call<void>('/settings/submit-feedback', { rating, comment }),
    });
}
