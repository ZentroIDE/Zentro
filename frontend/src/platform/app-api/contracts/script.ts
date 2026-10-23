// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface ScriptAdapter {
    getScripts(
        projectId: string,
        connectionName: string,
    ): Promise<KernelResult<models.SavedScript[]>>;
    getScriptContent(
        projectId: string,
        connectionName: string,
        scriptId: string,
    ): Promise<KernelResult<string>>;
    saveScript(script: models.SavedScript, content: string): Promise<KernelResult<void>>;
    deleteScript(
        projectId: string,
        connectionName: string,
        scriptId: string,
    ): Promise<KernelResult<void>>;
}
