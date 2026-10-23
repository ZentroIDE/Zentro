// SPDX-License-Identifier: GPL-3.0-only

import type { LicenseAdapter } from '../contracts/license';
import type { RestHttpClient } from './httpClient';

export function createLicenseRestAdapter(client: RestHttpClient): LicenseAdapter {
    return {
        getLicenseState: () => client.call('/license/get-license-state'),
        startTrial: email => client.call('/license/start-trial', { email }),
        restoreLicenseByEmail: email => client.call('/license/restore-license-by-email', { email }),
        activateLicense: (key, deviceInfo) =>
            client.call('/license/activate-license', { key, deviceInfo }),
        refreshLicense: sessionToken => client.call('/license/refresh-license', { sessionToken }),
        deactivateLicense: reason => client.call('/license/deactivate-license', { reason }),
        setSavedLicenseEmail: email => client.call('/license/set-saved-license-email', { email }),
        checkFeatureAccess: featureId =>
            client.call('/license/check-feature-access', { featureId }),
    };
}
