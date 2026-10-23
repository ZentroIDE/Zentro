// SPDX-License-Identifier: GPL-3.0-only

import type { PluginAdapter } from '../contracts/plugin';
import type { RestHttpClient } from './httpClient';
import type { PluginContribution } from '../../../lib/plugin/contracts';

export function createPluginRestAdapter(client: RestHttpClient): PluginAdapter {
    return {
        registerPluginContribution: contribution =>
            client.call('/plugin/register-plugin-contribution', { contribution }),
        listPluginByCapability: capability =>
            client.call('/plugin/list-by-capability', { capability }),
    };
}
