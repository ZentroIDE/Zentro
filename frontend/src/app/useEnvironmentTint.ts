// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useEnvironmentStore } from '../stores/environmentStore';
import { isProtectedEnvironmentKey } from '../lib/projects';

/**
 * Ambient environment safety wash: sets data-env-tint on the root element so
 * tokens.css can wash the whole app background when staging/production is
 * active, not just the toolbar badge. Removed entirely outside those two
 * environments (and when no project is open).
 */
export function useEnvironmentTint() {
    const activeEnvironmentKey = useEnvironmentStore(s => s.activeEnvironmentKey);
    const defaultEnvironmentKey = useProjectStore(s => s.activeProject?.default_environment_key);
    const envKey = activeEnvironmentKey || defaultEnvironmentKey;

    useEffect(() => {
        const root = document.documentElement;
        if (isProtectedEnvironmentKey(envKey)) {
            root.setAttribute('data-env-tint', envKey);
        } else {
            root.removeAttribute('data-env-tint');
        }
        return () => {
            root.removeAttribute('data-env-tint');
        };
    }, [envKey]);
}
