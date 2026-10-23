// SPDX-License-Identifier: GPL-3.0-only

import type { AppApiGateway } from './types';
import { connectionAdapter } from './connection.adapter';
import { queryAdapter } from './query.adapter';
import { schemaAdapter } from './schema.adapter';
import { projectAdapter } from './project.adapter';
import { securityAdapter } from './security.adapter';
import { sourceControlAdapter } from './sourceControl.adapter';
import { licenseAdapter } from './license.adapter';
import { settingsAdapter } from './settings.adapter';
import { jobAdapter } from './job.adapter';
import { importAdapter } from './import.adapter';
import { serverSessionAdapter } from './serverSession.adapter';
import { aiAdapter } from './ai.adapter';
import { statsAdapter } from './stats.adapter';
import { terminalAdapter } from './terminal.adapter';

export const wailsGateway: AppApiGateway = {
    ...connectionAdapter,
    ...queryAdapter,
    ...schemaAdapter,
    ...projectAdapter,
    ...securityAdapter,
    ...sourceControlAdapter,
    ...licenseAdapter,
    ...settingsAdapter,
    ...jobAdapter,
    ...importAdapter,
    ...serverSessionAdapter,
    ...aiAdapter,
    ...statsAdapter,
    ...terminalAdapter,
};
