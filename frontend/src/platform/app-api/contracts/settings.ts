// SPDX-License-Identifier: GPL-3.0-only

import type { app, utils } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface SettingsAdapter {
    getPreferences(): Promise<KernelResult<utils.Preferences>>;
    setPreferences(preferences: utils.Preferences): Promise<KernelResult<void>>;
    checkForUpdates(): Promise<KernelResult<app.UpdateInfo>>;
    getAboutInfo(): Promise<KernelResult<app.AboutInfo>>;
    // Auto-update (see internal/app/update_installer_*.go). Only actually
    // silent when AboutInfo.canAutoUpdate is true - Windows, or Linux running
    // as an AppImage; every other install falls back to opening the release
    // page. Optional: the REST adapter (web/non-desktop mode) doesn't
    // implement these, same as exportProfilePackage below. RestartAndUpdate
    // quits this process immediately and hands the whole download -> verify
    // -> install -> relaunch sequence to a detached helper - nothing about it
    // is observable from here, so the only follow-up is
    // consumeLastUpdateResult on the next launch.
    restartAndUpdate?(info: app.UpdateInfo): Promise<KernelResult<void>>;
    consumeLastUpdateResult?(): Promise<KernelResult<app.LastUpdateResult | boolean>>;
    getEnvironmentPolicies(): Promise<KernelResult<Record<string, app.ExecutionPolicy>>>;
    setEnvironmentSafetyLevel(
        environmentKey: string,
        level: string,
    ): Promise<KernelResult<Record<string, app.ExecutionPolicy>>>;
    exportProfilePackage?(
        jsonContent: string,
        defaultFileName: string,
    ): Promise<KernelResult<string>>;
    shouldPromptForFeedback?(): Promise<KernelResult<boolean>>;
    markFeedbackPrompted?(): Promise<KernelResult<void>>;
    submitFeedback?(rating: number, comment: string): Promise<KernelResult<void>>;
}
