// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { models } from '../../../wailsjs/go/models';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import { toProject } from './projectMapper';

function makeRawProject(overrides: Partial<Record<string, unknown>> = {}): models.Project {
    return models.Project.createFrom({
        id: 'p1',
        slug: 'project-1',
        name: 'Project 1',
        description: '',
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
        layout_state: '',
        environments: [],
        connections: [],
        assets: [],
        ...overrides,
    });
}

describe('toProject', () => {
    it('normalizes environment keys and preserves valid fields', () => {
        const project = toProject(
            makeRawProject({
                default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
                last_active_environment_key: 'invalid-env',
                environments: [{ id: 'e1', project_id: 'p1', key: 'invalid-env' }],
                auto_commit_on_exit: true,
                auto_schema_snapshots: true,
            }),
        );

        expect(project.default_environment_key).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
        expect(project.last_active_environment_key).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
        expect(project.environments?.[0]?.key).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
        expect(project.auto_commit_on_exit).toBe(true);
        expect(project.auto_schema_snapshots).toBe(true);
    });

    it('maps the project color and drops empty or non-string values', () => {
        expect(toProject(makeRawProject({ color: 'teal' })).color).toBe('teal');
        expect(toProject(makeRawProject({ color: '' })).color).toBeUndefined();
        expect(toProject(makeRawProject({ color: 42 })).color).toBeUndefined();
        expect(toProject(makeRawProject()).color).toBeUndefined();
    });

    it('preserves versioned SQL completion memory from the gateway model', () => {
        const completionMemory = {
            version: 1,
            entries: [
                {
                    suggestionKey: 'users',
                    suggestionKind: 'table',
                    contextBucket: 'from|main|postgres|public|',
                    acceptCount: 2,
                    lastAcceptedAt: 100,
                },
            ],
        };

        expect(
            toProject(makeRawProject({ completion_memory: completionMemory })).completion_memory,
        ).toEqual(completionMemory);
    });
});
