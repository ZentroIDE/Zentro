// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState } from 'react';

import { Spinner } from '../ui';
import type { StartupPhase } from '../../features/app-runtime/useStartupPhase';

const STARTUP_LOADING_FADE_MS = 480;

interface StartupGateProps {
    /**
     * The current startup phase. Anything other than 'ready' shows the
     * overlay; 'ready' fades it out.
     */
    phase: StartupPhase;
}

/**
 * Full-screen loading splash shown until the app finishes its multi-phase
 * startup (see {@link useStartupPhase}). Renders mounted for the full
 * fade-out duration so the CSS animation can complete before the DOM node
 * is removed.
 *
 * Replaces the previously duplicated overlay JSX that appeared in two
 * branches of App.tsx — render this once at the top level and it covers
 * both the "no active project" and "project chosen" cases.
 */
export const StartupGate: React.FC<StartupGateProps> = ({ phase }) => {
    const shouldBlock = phase !== 'ready';

    const [mounted, setMounted] = useState(true);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (shouldBlock) {
            setMounted(true);
            const rafId = window.requestAnimationFrame(() => {
                setVisible(true);
            });
            return () => {
                window.cancelAnimationFrame(rafId);
            };
        }

        setVisible(false);
        const timeoutId = window.setTimeout(() => {
            setMounted(false);
        }, STARTUP_LOADING_FADE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [shouldBlock]);

    if (!mounted) return null;

    const message =
        phase === 'hydratingAppState'
            ? 'Restoring your workspace state...'
            : 'Preparing your workspace...';

    return (
        <div
            className={`fixed inset-0 z-[9999] flex h-full w-full flex-col items-center justify-center gap-3 bg-background ${visible ? 'opacity-100 animate-[startup-loading-fade-in_480ms_linear_forwards]' : 'pointer-events-none opacity-0 animate-[startup-loading-fade-out_480ms_linear_forwards]'}`}
            data-testid='startup-loading'
        >
            <Spinner size={24} />
            <div className='text-small text-muted-foreground'>{message}</div>
        </div>
    );
};
