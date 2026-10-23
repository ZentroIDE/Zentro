// SPDX-License-Identifier: GPL-3.0-only

import type { PluginContribution } from '../../../lib/plugin/contracts';

export interface PluginAdapter {
    registerPluginContribution?(contribution: PluginContribution): Promise<void>;
    listPluginByCapability?(capability: string): Promise<PluginContribution[]>;
}
