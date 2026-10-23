// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { ScriptAdapter } from '../contracts/script';
import type { RestHttpClient } from './httpClient';
import type { models } from '../../../../wailsjs/go/models';

export function createScriptRestAdapter(client: RestHttpClient): ScriptAdapter {
    return withKernelResult('script', {
        getScripts: (projectId: string, connectionName: string) =>
            client.call<models.SavedScript[]>('/script/get-scripts', {
                projectId,
                connectionName,
            }),
        getScriptContent: (projectId: string, connectionName: string, scriptId: string) =>
            client.call<string>('/script/get-script-content', {
                projectId,
                connectionName,
                scriptId,
            }),
        saveScript: (script: models.SavedScript, content: string) =>
            client.call<void>('/script/save-script', { script, content }),
        deleteScript: (projectId: string, connectionName: string, scriptId: string) =>
            client.call<void>('/script/delete-script', {
                projectId,
                connectionName,
                scriptId,
            }),
    });
}
