// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { TemplateAdapter } from '../contracts/template';
import type { RestHttpClient } from './httpClient';
import type { models } from '../../../../wailsjs/go/models';

export function createTemplateRestAdapter(client: RestHttpClient): TemplateAdapter {
    return withKernelResult('template', {
        loadTemplates: () => client.call<models.Template[]>('/template/load-templates'),
        saveTemplate: (template: models.Template) =>
            client.call<void>('/template/save-template', { template }),
        deleteTemplate: (templateId: string) =>
            client.call<void>('/template/delete-template', { templateId }),
    });
}
