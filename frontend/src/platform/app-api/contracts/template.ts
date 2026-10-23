// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface TemplateAdapter {
    loadTemplates(): Promise<KernelResult<models.Template[]>>;
    saveTemplate(template: models.Template): Promise<KernelResult<void>>;
    deleteTemplate(templateId: string): Promise<KernelResult<void>>;
}
