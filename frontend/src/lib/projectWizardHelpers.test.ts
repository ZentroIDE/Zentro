// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildBoundProjectDraft,
    buildUnboundProjectDraft,
    joinPath,
    normalizePathForCompare,
    resolveDefaultEnvironment,
    slugifyProjectName,
} from './projectWizardHelpers';
import { ENVIRONMENT_KEY } from './constants';
import type { EnvironmentKey, Project, ProjectEnvironment } from '../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'proj-1',
        name: 'My Project',
        slug: 'my-project',
        description: '',
        created_at: '',
        updated_at: '',
        environments: [],
        default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
        ...overrides,
    } as Project;
}

function makeEnv(
    key: EnvironmentKey,
    overrides: Partial<ProjectEnvironment> = {},
): ProjectEnvironment {
    return {
        id: `env-${key}`,
        project_id: 'proj-1',
        key,
        label: key,
        badge_color: key,
        is_protected: false,
        is_read_only: false,
        ...overrides,
    };
}

beforeEach(() => {
    let counter = 0;
    vi.stubGlobal('crypto', {
        randomUUID: () => `uuid-${++counter}`,
    });
});

describe('slugifyProjectName', () => {
    it('lower-cases and collapses non-alphanumeric runs to dashes', () => {
        expect(slugifyProjectName('My Project!')).toBe('my-project');
        expect(slugifyProjectName('  Spaces  ')).toBe('spaces');
    });
    it('trims leading and trailing dashes', () => {
        expect(slugifyProjectName('---foo---')).toBe('foo');
    });
    it('returns "project" for empty input', () => {
        expect(slugifyProjectName('')).toBe('project');
        expect(slugifyProjectName('   ')).toBe('project');
    });
    it('returns "project" when input contains nothing alphanumeric', () => {
        expect(slugifyProjectName('!!!')).toBe('project');
    });
    it('preserves digits; underscore is treated like punctuation', () => {
        expect(slugifyProjectName('foo_bar 123')).toBe('foo-bar-123');
    });
});

describe('joinPath', () => {
    it('uses backslash when the parent contains backslashes', () => {
        expect(joinPath('C:\\projects', 'foo')).toBe('C:\\projects\\foo');
    });
    it('uses forward slash otherwise', () => {
        expect(joinPath('/home/user', 'foo')).toBe('/home/user/foo');
    });
    it('returns empty string for an empty parent', () => {
        expect(joinPath('', 'foo')).toBe('');
        expect(joinPath('   ', 'foo')).toBe('');
    });
    it('strips trailing separators on the parent before joining', () => {
        expect(joinPath('/home/user/', 'foo')).toBe('/home/user/foo');
        expect(joinPath('C:\\projects\\', 'foo')).toBe('C:\\projects\\foo');
    });
});

describe('normalizePathForCompare', () => {
    it('collapses mixed separators to backslash and lower-cases', () => {
        expect(normalizePathForCompare('C:/Projects\\Foo/Bar')).toBe('c:\\projects\\foo\\bar');
    });
    it('strips trailing separators', () => {
        expect(normalizePathForCompare('C:\\projects\\\\')).toBe('c:\\projects');
    });
});

describe('resolveDefaultEnvironment', () => {
    it('prefers last_active_environment_key', () => {
        const project = makeProject({
            last_active_environment_key: ENVIRONMENT_KEY.STAGING as EnvironmentKey,
            default_environment_key: ENVIRONMENT_KEY.PRODUCTION as EnvironmentKey,
        });
        expect(resolveDefaultEnvironment(project)).toBe(ENVIRONMENT_KEY.STAGING);
    });
    it('falls back to default_environment_key', () => {
        const project = makeProject({
            default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
        });
        expect(resolveDefaultEnvironment(project)).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
    });
    it('falls back to DEVELOPMENT when no project provided', () => {
        expect(resolveDefaultEnvironment(undefined)).toBe(ENVIRONMENT_KEY.DEVELOPMENT);
    });
});

describe('buildBoundProjectDraft', () => {
    it('appends a fresh environment referencing the pool connection by name', () => {
        const project = makeProject();
        const draft = buildBoundProjectDraft(
            project,
            ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
            'dev-pg',
            'appdb',
        );
        expect(draft.environments ?? []).toHaveLength(1);
        expect((draft.environments ?? [])[0].connection_ref).toBe('dev-pg');
        expect((draft.environments ?? [])[0].last_database).toBe('appdb');
    });

    it('overwrites an existing env binding in place (no duplicate env row)', () => {
        const project = makeProject({
            environments: [
                makeEnv(ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey, {
                    connection_ref: 'old',
                    last_database: 'old-db',
                }),
            ],
        });
        const draft = buildBoundProjectDraft(
            project,
            ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
            'new',
            'new-db',
        );
        expect(draft.environments ?? []).toHaveLength(1);
        expect((draft.environments ?? [])[0].connection_ref).toBe('new');
        expect((draft.environments ?? [])[0].last_database).toBe('new-db');
        expect((draft.environments ?? [])[0].id).toBe('env-dev'); // env row reused
    });

    it('marks a fresh production env as protected + read-only by default', () => {
        const project = makeProject();
        const draft = buildBoundProjectDraft(
            project,
            ENVIRONMENT_KEY.PRODUCTION as EnvironmentKey,
            'prod-pg',
            'appdb',
        );
        expect((draft.environments ?? [])[0].is_protected).toBe(true);
        expect((draft.environments ?? [])[0].is_read_only).toBe(true);
    });
});

describe('buildUnboundProjectDraft', () => {
    it('clears connection_ref and last_database for the target environment', () => {
        const project = makeProject({
            environments: [
                makeEnv(ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey, {
                    connection_ref: 'dev-pg',
                    last_database: 'appdb',
                }),
            ],
        });
        const draft = buildUnboundProjectDraft(
            project,
            ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
        );
        expect((draft.environments ?? [])[0].connection_ref).toBeUndefined();
        expect((draft.environments ?? [])[0].last_database).toBeUndefined();
    });

    it('leaves other environments untouched', () => {
        const project = makeProject({
            environments: [
                makeEnv(ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey, {
                    connection_ref: 'dev-pg',
                }),
                makeEnv(ENVIRONMENT_KEY.STAGING as EnvironmentKey, {
                    connection_ref: 'staging-pg',
                    last_database: 'appdb',
                }),
            ],
        });
        const draft = buildUnboundProjectDraft(
            project,
            ENVIRONMENT_KEY.DEVELOPMENT as EnvironmentKey,
        );
        const staging = (draft.environments ?? []).find(
            environment => environment.key === ENVIRONMENT_KEY.STAGING,
        );
        expect(staging?.connection_ref).toBe('staging-pg');
        expect(staging?.last_database).toBe('appdb');
    });

    it('is a no-op when the environment does not exist at all', () => {
        const project = makeProject();
        const draft = buildUnboundProjectDraft(
            project,
            ENVIRONMENT_KEY.PRODUCTION as EnvironmentKey,
        );
        expect(draft.environments).toEqual([]);
    });
});
