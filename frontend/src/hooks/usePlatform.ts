// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import * as runtime from '../../wailsjs/runtime/runtime';

type Platform = 'darwin' | 'windows' | 'linux' | null;

let cached: Platform = null;

export function usePlatform(): Platform {
    const [platform, setPlatform] = useState<Platform>(cached);

    useEffect(() => {
        if (cached) return;
        const environmentFn = (runtime as { Environment?: () => Promise<{ platform?: string }> })
            .Environment;
        if (typeof environmentFn !== 'function') return;
        try {
            // Environment() reads window.runtime synchronously before
            // returning a promise, so it can throw outright (not just
            // reject) outside the Wails runtime — dev browser, tests.
            void environmentFn()
                .then(env => {
                    cached = env.platform as Platform;
                    setPlatform(cached);
                })
                .catch(() => {
                    // non-runtime env (dev browser)
                });
        } catch {
            // non-runtime env (dev browser, tests)
        }
    }, []);

    return platform;
}
