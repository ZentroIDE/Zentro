// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { normalizeProjectServiceError } from './projectServiceError';

describe('normalizeProjectServiceError', () => {
    it('classifies free-plan-limit gateway errors', () => {
        const error = normalizeProjectServiceError(
            new Error(
                'free plan limit: you can have up to 5 projects. Upgrade to Pro for unlimited projects',
            ),
        );

        expect(error.name).toBe('ProjectServiceError');
        expect(error.code).toBe('project_limit_reached');
        expect(error.message).toBe(
            'free plan limit: you can have up to 5 projects. Upgrade to Pro for unlimited projects',
        );
    });

    it('classifies storage path conflict errors', () => {
        const error = normalizeProjectServiceError(
            new Error('storage path already belongs to another project'),
        );

        expect(error.code).toBe('project_path_conflict');
    });

    it('classifies project lock conflicts', () => {
        const error = normalizeProjectServiceError(
            new Error('cannot open "My Project": project is already open in another Zentro window'),
        );

        expect(error.code).toBe('project_locked');
    });

    it('classifies a folder without project.json as not_a_project', () => {
        const error = normalizeProjectServiceError(
            new Error('not a zentro project: /tmp/x has no project.json'),
        );

        expect(error.code).toBe('not_a_project');
    });

    it('classifies manifest import errors', () => {
        const error = normalizeProjectServiceError(new Error('parse project manifest: bad json'));

        expect(error.code).toBe('project_import_invalid');
    });

    it('falls back to unknown for unrecognized errors', () => {
        const error = normalizeProjectServiceError(new Error('something else broke'));

        expect(error.code).toBe('unknown');
    });

    it('returns the same instance if already a ProjectServiceError', () => {
        const original = normalizeProjectServiceError(new Error('free plan limit: nope'));

        expect(normalizeProjectServiceError(original)).toBe(original);
    });
});
