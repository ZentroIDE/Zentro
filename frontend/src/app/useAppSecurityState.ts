// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect } from 'react';
import { useAutoLockOnIdle } from '../features/app-runtime/useAutoLockOnIdle';
import { FEATURE } from '../lib/license/entitlementMatrix';
import { useFeatureGate } from '../lib/license/useFeatureGate';
import { useSecurityStore } from '../stores/securityStore';

export function useAppSecurityState() {
    const gate = useFeatureGate();
    const canUseAppLock = gate.canUse(FEATURE.SECURITY_APP_LOCK);
    const appLockEnabled = useSecurityStore(state => state.app_lock_enabled);
    const appLockConfigured = useSecurityStore(state => state.app_lock_configured);
    const appLockTimeoutSec = useSecurityStore(state => state.app_lock_timeout_sec);
    const appLocked = useSecurityStore(state => state.app_locked);
    const loadSecurityState = useSecurityStore(state => state.load);
    const lockApp = useSecurityStore(state => state.lockApp);

    const autoLockEnabled = canUseAppLock && appLockEnabled && appLockConfigured && !appLocked;
    const handleAutoLock = useCallback(() => {
        void lockApp();
    }, [lockApp]);

    const { resetActivity } = useAutoLockOnIdle({
        enabled: autoLockEnabled,
        timeoutSec: appLockTimeoutSec,
        onAutoLock: handleAutoLock,
    });

    useEffect(() => {
        void loadSecurityState();
    }, [loadSecurityState]);

    return {
        appLocked,
        canUseAppLock,
        resetActivity,
    };
}
