// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { saveAllOpenQueryTabs } from '../editor/scriptAutosave';

export async function forceQuitWithAutosave(): Promise<void> {
    try {
        await saveAllOpenQueryTabs({ timeoutMs: 8000, concurrency: 4 });
    } catch {
        // best effort
    }
    unwrapOrThrow(await getApiGateway().project.forceQuit());
}
