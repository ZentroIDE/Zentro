// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState } from 'react';

import { useToast } from './Toast';
import { useSecurityStore } from '../../stores/securityStore';
import { Button, Input } from '../ui';

const PIN_FAILURE_THRESHOLD_FOR_WINDOWS = 3;

interface AppLockOverlayProps {
    /** Called after a successful unlock so the caller can reset its idle timer. */
    onUnlocked: () => void;
}

/**
 * Lock screen rendered while {@link useSecurityStore.app_locked} is true.
 * Offers two unlock paths:
 *   - PIN input (always available)
 *   - "Verify with Windows" (revealed after 3 PIN failures, falls back to OS auth)
 *
 * Owns its own input + busy + failure-counter state — App.tsx does not need
 * to know about any of it. After unlock succeeds, `onUnlocked` notifies the
 * caller so it can refresh its idle timer.
 */
export const AppLockOverlay: React.FC<AppLockOverlayProps> = ({ onUnlocked }) => {
    const appLocked = useSecurityStore(state => state.app_locked);
    const unlockApp = useSecurityStore(state => state.unlockApp);
    const unlockAppWithOS = useSecurityStore(state => state.unlockAppWithOS);
    const { toast } = useToast();

    const [unlockPin, setUnlockPin] = useState('');
    const [unlockingApp, setUnlockingApp] = useState(false);
    const [unlockFailures, setUnlockFailures] = useState(0);
    const [unlockingWithWindows, setUnlockingWithWindows] = useState(false);

    // Reset transient unlock UI when the overlay is dismissed (lock cleared
    // by some other path — autoUnlock, force-quit, etc.).
    useEffect(() => {
        if (!appLocked) {
            setUnlockPin('');
            setUnlockFailures(0);
            setUnlockingWithWindows(false);
        }
    }, [appLocked]);

    const handleUnlockWithPin = () => {
        if (unlockingApp || unlockingWithWindows || !unlockPin.trim()) {
            return;
        }
        setUnlockingApp(true);
        void unlockApp(unlockPin)
            .then(() => {
                onUnlocked();
                setUnlockFailures(0);
            })
            .catch(() => {
                let nextFailureCount = 1;
                setUnlockFailures(current => {
                    nextFailureCount = current + 1;
                    return nextFailureCount;
                });
                if (nextFailureCount >= PIN_FAILURE_THRESHOLD_FOR_WINDOWS) {
                    toast.error('Incorrect PIN. You can now verify with Windows.', {
                        important: true,
                        source: 'security.app-lock',
                        dedupeKey: 'app-lock-pin-threshold',
                    });
                    return;
                }
                toast.error('Incorrect PIN.');
            })
            .finally(() => {
                setUnlockingApp(false);
            });
    };

    const handleUnlockWithWindows = () => {
        if (unlockingApp || unlockingWithWindows) {
            return;
        }
        setUnlockingWithWindows(true);
        void unlockAppWithOS()
            .then(() => {
                onUnlocked();
                setUnlockFailures(0);
            })
            .catch(error => {
                const message =
                    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
                if (message.toLowerCase().includes('cancelled')) {
                    return;
                }
                toast.error(message || 'Windows verification failed.', {
                    important: true,
                    source: 'security.app-lock',
                    dedupeKey: 'app-lock-windows-verify',
                });
            })
            .finally(() => {
                setUnlockingWithWindows(false);
            });
    };

    const showWindowsFallback = unlockFailures >= PIN_FAILURE_THRESHOLD_FOR_WINDOWS;

    return (
        <div className='fixed inset-0 z-10020 flex items-center justify-center bg-background/40 backdrop-blur-sm'>
            <div className='w-full p-10 max-w-md rounded-md bg-card shadow-elevation-md flex flex-col gap-8'>
                <div className=''>
                    <h2 className='text-small font-semibold text-foreground'>Zentro was Locked</h2>
                    <p className='mt-2 text-label text-muted-foreground'>
                        Enter your PIN to continue using app
                    </p>
                    {showWindowsFallback && (
                        <p className='mt-2 text-label text-muted-foreground'>
                            Trouble with your PIN? Verify with Windows to unlock and keep moving.
                        </p>
                    )}
                </div>
                <div className='flex items-center gap-2'>
                    <Input
                        type='password'
                        value={unlockPin}
                        onChange={event => setUnlockPin(event.target.value)}
                        placeholder='Enter PIN'
                        autoFocus
                        onKeyDown={event => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            handleUnlockWithPin();
                        }}
                    />
                    <Button
                        variant='default'
                        onClick={handleUnlockWithPin}
                        disabled={unlockingApp || unlockingWithWindows || !unlockPin.trim()}
                    >
                        {unlockingApp ? 'Unlocking...' : 'Unlock'}
                    </Button>
                </div>
                {showWindowsFallback && (
                    <div className='flex justify-end'>
                        <Button
                            type='button'
                            variant='outline'
                            onClick={handleUnlockWithWindows}
                            disabled={unlockingApp || unlockingWithWindows}
                        >
                            {unlockingWithWindows
                                ? 'Waiting for Windows...'
                                : 'Verify with Windows'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
