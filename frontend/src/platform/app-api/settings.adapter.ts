// SPDX-License-Identifier: GPL-3.0-only

import {
    GetPreferences,
    SetPreferences,
    CheckForUpdates,
    GetAboutInfo,
    RestartAndUpdate,
    ConsumeLastUpdateResult,
    GetEnvironmentPolicies,
    SetEnvironmentSafetyLevel,
    LoadTemplates,
    SaveTemplate,
    DeleteTemplate,
    ExportProfilePackage,
    ShouldPromptForFeedback,
    MarkFeedbackPrompted,
    SubmitFeedback,
} from '../../../wailsjs/go/app/App';

export const settingsAdapter = {
    GetPreferences,
    SetPreferences,
    CheckForUpdates,
    GetAboutInfo,
    RestartAndUpdate,
    ConsumeLastUpdateResult,
    GetEnvironmentPolicies,
    SetEnvironmentSafetyLevel,
    LoadTemplates,
    SaveTemplate,
    DeleteTemplate,
    ExportProfilePackage,
    ShouldPromptForFeedback,
    MarkFeedbackPrompted,
    SubmitFeedback,
};
