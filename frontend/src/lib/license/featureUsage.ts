// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import type { FeatureId } from './entitlementMatrix';

// Fire-and-forget: logs that a Pro capability was actually invoked, so the
// backend can later tell which Pro features drove engagement during the
// 30-day trial (ADR 0019). Only reported while a trial is active - paid
// Pro/Free usage isn't logged, since the goal is trial feedback, not general
// telemetry. Takes a plain boolean (rather than the full FeatureGate) so
// callers with only a narrow gate-shaped prop can still report usage.
export function reportFeatureUsage(isTrialActive: boolean, featureId: FeatureId): void {
    if (!isTrialActive) return;
    void getApiGateway()
        .license.recordFeatureUsage?.(featureId)
        ?.catch(() => {
            // Best-effort telemetry; never surface a failure to the user.
        });
}
