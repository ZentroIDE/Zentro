// SPDX-License-Identifier: GPL-3.0-only

import type { AccessResult, LicenseState } from '../../../lib/license/types';

export interface LicenseAdapter {
    getLicenseState?(): Promise<LicenseState>;
    startTrial?(email: string): Promise<LicenseState>;
    restoreLicenseByEmail?(email: string): Promise<LicenseState>;
    activateLicense?(key: string, deviceInfo: string): Promise<LicenseState>;
    refreshLicense?(sessionToken: string): Promise<LicenseState>;
    deactivateLicense?(reason: string): Promise<void>;
    setSavedLicenseEmail?(email: string): Promise<LicenseState>;
    checkFeatureAccess?(featureId: string): Promise<AccessResult>;
    recordFeatureUsage?(featureId: string): Promise<void>;
    createCheckoutUrl?(email: string): Promise<string>;
}
