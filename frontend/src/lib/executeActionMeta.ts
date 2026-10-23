// SPDX-License-Identifier: GPL-3.0-only

import { ENVIRONMENT_KEY } from './constants';
import { getEnvironmentMeta } from './projects';

export interface ExecuteActionMeta {
    variant: 'ghost' | 'destructive';
    tone: 'default';
    confirmButtonClassName: string;
    title: string;
    ariaLabel: string;
    actionLabel: string;
    progressLabel: string;
}

export function getExecuteActionMeta(
    environmentKey?: string | null,
    runQueryHint: string = 'Ctrl+Enter',
): ExecuteActionMeta {
    const environmentMeta = getEnvironmentMeta(environmentKey);
    const actionLabel = `Execute on ${environmentMeta.label}`;

    return {
        variant: environmentKey === ENVIRONMENT_KEY.PRODUCTION ? 'destructive' : 'ghost',
        tone: 'default',
        confirmButtonClassName: (() => {
            switch (environmentKey) {
                case ENVIRONMENT_KEY.DEVELOPMENT:
                    return 'env-action-dev';
                case ENVIRONMENT_KEY.STAGING:
                    return 'env-action-sta';
                case ENVIRONMENT_KEY.PRODUCTION:
                    return 'env-action-pro';
                default:
                    return '';
            }
        })(),
        title: `${actionLabel} (${runQueryHint})`,
        ariaLabel: actionLabel,
        actionLabel,
        progressLabel: 'Executing...',
    };
}
