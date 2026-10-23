// SPDX-License-Identifier: GPL-3.0-only

import { FeatureGate, type FeatureUiAccess } from './featureGate';

export type UpgradeDialogSource = 'project-limit' | 'write-confirm';

export interface FeatureActionAccess extends FeatureUiAccess {
    allowed: boolean;
    upgradeSource?: UpgradeDialogSource;
}

export function resolveFeatureActionAccess(
    gate: FeatureGate,
    featureId: string,
): FeatureActionAccess {
    const access = gate.getFeatureAccess(featureId);
    return {
        ...access,
        allowed: access.state === 'enabled',
        upgradeSource: access.state === 'upgrade' ? 'write-confirm' : undefined,
    };
}

export function resolveProjectLimitActionAccess(
    gate: FeatureGate,
    admittedProjects: number,
): FeatureActionAccess {
    const access = gate.getProjectLimitAccess(admittedProjects);
    return {
        ...access,
        allowed: access.state === 'enabled',
        upgradeSource: access.state === 'upgrade' ? 'project-limit' : undefined,
    };
}
