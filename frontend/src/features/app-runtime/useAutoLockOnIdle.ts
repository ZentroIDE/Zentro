// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';

interface UseAutoLockOnIdleArgs {
    enabled: boolean;
    timeoutSec: number | undefined;
    onAutoLock: () => void;
}

/**
 * Auto-lock helper: tracks the last user-activity timestamp (mousemove,
 * mousedown, keydown) and fires `onAutoLock` when the window regains focus
 * after `timeoutSec` of inactivity.
 *
 * Listeners are passive where they can be (mousemove). The activity timestamp
 * is stored in a ref so the hook never re-renders on every input event.
 *
 * Caller is expected to pre-compute whether the lock is currently armed
 * (license + configured + enabled + not-yet-locked) and pass it as
 * `enabled` — this keeps platform/license gating out of the hook.
 */
export function useAutoLockOnIdle({ enabled, timeoutSec, onAutoLock }: UseAutoLockOnIdleArgs) {
    const lastActivityAtRef = useRef(Date.now());

    useEffect(() => {
        const markActivity = () => {
            lastActivityAtRef.current = Date.now();
        };

        const handleFocus = () => {
            const idleLimitMs = (timeoutSec || 300) * 1000;
            const shouldLock = enabled && Date.now() - lastActivityAtRef.current >= idleLimitMs;
            if (shouldLock) {
                onAutoLock();
                return;
            }
            markActivity();
        };

        window.addEventListener('mousemove', markActivity, { passive: true });
        window.addEventListener('mousedown', markActivity);
        window.addEventListener('keydown', markActivity);
        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('mousemove', markActivity);
            window.removeEventListener('mousedown', markActivity);
            window.removeEventListener('keydown', markActivity);
            window.removeEventListener('focus', handleFocus);
        };
    }, [enabled, timeoutSec, onAutoLock]);

    /** Reset the activity timer to "now" — call after a successful unlock. */
    const resetActivity = () => {
        lastActivityAtRef.current = Date.now();
    };

    return { resetActivity };
}
