// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { models } from '../../wailsjs/go/models';

type Template = models.Template;

interface TemplateState {
    templates: Template[];
    isLoading: boolean;
    error: string | null;

    loadTemplates: () => Promise<void>;
    saveTemplate: (template: Template) => Promise<void>;
    deleteTemplate: (id: string) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
    templates: [],
    isLoading: false,
    error: null,

    loadTemplates: async () => {
        set({ isLoading: true, error: null });
        const result = await getApiGateway().template.loadTemplates();
        if (result.ok) {
            set({ templates: result.data || [], isLoading: false });
        } else {
            set({ error: result.error.message || 'Failed to load templates', isLoading: false });
        }
    },

    saveTemplate: async (template: Template) => {
        set({ isLoading: true, error: null });
        const result = await getApiGateway().template.saveTemplate(template);
        if (result.ok) {
            await get().loadTemplates();
        } else {
            set({ error: result.error.message || 'Failed to save template', isLoading: false });
        }
    },

    deleteTemplate: async (id: string) => {
        set({ isLoading: true, error: null });
        const result = await getApiGateway().template.deleteTemplate(id);
        if (result.ok) {
            await get().loadTemplates();
        } else {
            set({ error: result.error.message || 'Failed to delete template', isLoading: false });
        }
    },
}));
