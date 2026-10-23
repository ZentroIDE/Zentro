// SPDX-License-Identifier: GPL-3.0-only

import { onLicenseStateChanged } from '../../../lib/events';
import { emitLicenseStateChanged } from '../../../lib/license/service';
import type { Unsubscribe } from './shared';

// License entitlement change events.
export function subscribeLicenseEvents(): Unsubscribe[] {
    return [
        onLicenseStateChanged(() => {
            emitLicenseStateChanged();
        }),
    ];
}
