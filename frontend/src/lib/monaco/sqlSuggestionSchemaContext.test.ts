// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import type { Project } from '../../types/project';
import { applySqlCompletionAcceptance } from './sqlSuggestionSchemaContext';

describe('applySqlCompletionAcceptance', () => {
    it('updates schema context and project-scoped memory in one project change', () => {
        const project = {
            id: 'p1',
            slug: 'p1',
            name: 'Project',
            created_at: '',
            updated_at: '',
            default_environment_key: 'dev',
            environments: [
                {
                    id: 'e1',
                    project_id: 'p1',
                    key: 'dev',
                    label: 'Development',
                    is_protected: false,
                    is_read_only: false,
                },
            ],
        } as Project;

        const next = applySqlCompletionAcceptance(project, 'dev', {
            schemaName: 'public',
            suggestionKey: 'users',
            suggestionKind: 'table',
            contextBucket: 'from|main|postgres|public|',
        });

        expect(next?.environments?.[0].last_schema).toBe('public');
        expect(next?.completion_memory?.entries).toEqual([
            expect.objectContaining({ suggestionKey: 'users', acceptCount: 1 }),
        ]);
        expect(project.completion_memory).toBeUndefined();
    });
});
