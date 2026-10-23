// SPDX-License-Identifier: GPL-3.0-only

import type { ConnectionProfile } from '../../../types/connection';
import type { ProjectIconKey } from '../projectHubMeta';

export type ConnectionMode = 'existing' | 'new';

export interface WizardDraftData {
    name: string;
    description: string;
    iconKey: ProjectIconKey;
    /** Palette key from PROJECT_COLOR_PALETTE. New projects seed this with
     * DEFAULT_PROJECT_COLOR_KEY; '' only occurs for legacy projects that
     * never had an explicit color (resolved via hash in lists). */
    colorKey: string;
}

export interface DraftEnvironmentBinding {
    profile: ConnectionProfile;
    profileName: string;
    database: string;
}
