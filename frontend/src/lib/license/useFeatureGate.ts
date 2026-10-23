// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { resolveFeatureActionAccess, resolveProjectLimitActionAccess } from './featureAccess';
import { getLicenseState, LICENSE_STATE_CHANGED_EVENT } from './service';
import { FeatureGate } from './featureGate';
import { createLicenseState, type LicenseState } from './types';

const FALLBACK_STATE: LicenseState = createLicenseState();

export function useFeatureGate() {
    const [state, setState] = React.useState<LicenseState>(FALLBACK_STATE);

    React.useEffect(() => {
        let mounted = true;
        const load = () =>
            getLicenseState().then(result => {
                if (!mounted || !result.ok) return;
                setState(result.data);
            });

        void load();

        const handleLicenseStateChanged = () => {
            void load();
        };

        window.addEventListener(LICENSE_STATE_CHANGED_EVENT, handleLicenseStateChanged);
        return () => {
            mounted = false;
            window.removeEventListener(LICENSE_STATE_CHANGED_EVENT, handleLicenseStateChanged);
        };
    }, []);

    return React.useMemo(() => new FeatureGate(state), [state]);
}

export function useFeatureAccess(featureId: string) {
    const gate = useFeatureGate();
    return React.useMemo(() => resolveFeatureActionAccess(gate, featureId), [featureId, gate]);
}

export function useProjectLimitAccess(admittedProjects: number) {
    const gate = useFeatureGate();
    return React.useMemo(
        () => resolveProjectLimitActionAccess(gate, admittedProjects),
        [admittedProjects, gate],
    );
}
