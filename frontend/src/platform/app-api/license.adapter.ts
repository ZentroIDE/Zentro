// SPDX-License-Identifier: GPL-3.0-only

import { CheckFeatureAccess } from '../../../wailsjs/go/app/App';
import {
    mapAccessResult,
    mapWailsLicenseState,
    type RawWailsLicenseState,
} from '../../lib/license/mappers';
import { optionalWailsBinding } from './wailsOptionalBinding';

// The whole license client (activate/trial/restore/refresh/state, all of
// internal/app/pro_license_facade.go) is Pro-only (ADR 0019, issue #130) —
// absent from a build exported without that file. CheckFeatureAccess is the
// one method here that lives in core (app_entitlement_facade.go), reading the
// Entitlements interface every build has a Free implementation of.
const ActivateLicense =
    optionalWailsBinding<(key: string, deviceInfo: string) => Promise<RawWailsLicenseState>>(
        'ActivateLicense',
    );
const StartTrial =
    optionalWailsBinding<(email: string) => Promise<RawWailsLicenseState>>('StartTrial');
const RestoreLicenseByEmail =
    optionalWailsBinding<(email: string) => Promise<RawWailsLicenseState>>('RestoreLicenseByEmail');
const RefreshLicense =
    optionalWailsBinding<(sessionToken: string) => Promise<RawWailsLicenseState>>('RefreshLicense');
const DeactivateLicense =
    optionalWailsBinding<(reason: string) => Promise<void>>('DeactivateLicense');
const GetLicenseState =
    optionalWailsBinding<() => Promise<RawWailsLicenseState>>('GetLicenseState');
const SetSavedLicenseEmail =
    optionalWailsBinding<(email: string) => Promise<RawWailsLicenseState>>('SetSavedLicenseEmail');
const RecordFeatureUsage =
    optionalWailsBinding<(featureId: string) => Promise<void>>('RecordFeatureUsage');
const CreateCheckoutURL =
    optionalWailsBinding<(email: string) => Promise<string>>('CreateCheckoutURL');

export const licenseAdapter = {
    ...(ActivateLicense
        ? {
              ActivateLicense: async (key: string, deviceInfo: string) =>
                  mapWailsLicenseState(await ActivateLicense(key, deviceInfo)),
          }
        : {}),
    ...(StartTrial
        ? { StartTrial: async (email: string) => mapWailsLicenseState(await StartTrial(email)) }
        : {}),
    ...(RestoreLicenseByEmail
        ? {
              RestoreLicenseByEmail: async (email: string) =>
                  mapWailsLicenseState(await RestoreLicenseByEmail(email)),
          }
        : {}),
    ...(RefreshLicense
        ? {
              RefreshLicense: async (sessionToken: string) =>
                  mapWailsLicenseState(await RefreshLicense(sessionToken)),
          }
        : {}),
    ...(DeactivateLicense ? { DeactivateLicense } : {}),
    ...(GetLicenseState
        ? { GetLicenseState: async () => mapWailsLicenseState(await GetLicenseState()) }
        : {}),
    ...(SetSavedLicenseEmail
        ? {
              SetSavedLicenseEmail: async (email: string) =>
                  mapWailsLicenseState(await SetSavedLicenseEmail(email)),
          }
        : {}),
    CheckFeatureAccess: async (featureId: string) =>
        mapAccessResult(await CheckFeatureAccess(featureId)),
    ...(RecordFeatureUsage ? { RecordFeatureUsage } : {}),
    ...(CreateCheckoutURL ? { CreateCheckoutURL } : {}),
};
