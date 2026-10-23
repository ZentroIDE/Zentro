// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../wailsjs/go/models';
import type {
    EnvironmentKey,
    Project,
    ProjectAsset,
    ProjectEnvironment,
} from '../../types/project';
import { ENVIRONMENT_KEYS } from '../../lib/projects';
import { ENVIRONMENT_KEY } from '../../lib/constants';

function toEnvironmentKey(
    value: unknown,
    fallback: EnvironmentKey = ENVIRONMENT_KEY.DEVELOPMENT,
): EnvironmentKey {
    if (typeof value === 'string' && ENVIRONMENT_KEYS.includes(value as EnvironmentKey)) {
        return value as EnvironmentKey;
    }
    return fallback;
}

function normalizeProjectEnvironment(projectId: string, raw: unknown): ProjectEnvironment {
    const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const key = toEnvironmentKey(source.key);

    return {
        id: typeof source.id === 'string' ? source.id : crypto.randomUUID(),
        project_id: typeof source.project_id === 'string' ? source.project_id : projectId,
        key,
        label: typeof source.label === 'string' ? source.label : key.toUpperCase(),
        badge_color: typeof source.badge_color === 'string' ? source.badge_color : key,
        is_protected: source.is_protected === true,
        is_read_only: source.is_read_only === true,
        connection_ref:
            typeof source.connection_ref === 'string' && source.connection_ref
                ? source.connection_ref
                : undefined,
        last_database: typeof source.last_database === 'string' ? source.last_database : undefined,
        last_schema: typeof source.last_schema === 'string' ? source.last_schema : undefined,
        last_catalog: typeof source.last_catalog === 'string' ? source.last_catalog : undefined,
    };
}

function toProject(raw: models.Project): Project {
    const source = raw as models.Project & Record<string, unknown>;
    const defaultEnvironmentKey = toEnvironmentKey(source.default_environment_key);
    const lastActiveEnvironmentKey = toEnvironmentKey(
        source.last_active_environment_key,
        defaultEnvironmentKey,
    );

    return {
        id: typeof source.id === 'string' ? source.id : '',
        slug: typeof source.slug === 'string' ? source.slug : '',
        name: typeof source.name === 'string' ? source.name : '',
        description: typeof source.description === 'string' ? source.description : undefined,
        color: typeof source.color === 'string' && source.color ? source.color : undefined,
        auto_commit_on_exit: source.auto_commit_on_exit === true,
        auto_schema_snapshots: source.auto_schema_snapshots === true,
        storage_path: typeof source.storage_path === 'string' ? source.storage_path : undefined,
        tags: Array.isArray(source.tags)
            ? source.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
        created_at: typeof source.created_at === 'string' ? source.created_at : '',
        updated_at: typeof source.updated_at === 'string' ? source.updated_at : '',
        last_opened_at:
            typeof source.last_opened_at === 'string' ? source.last_opened_at : undefined,
        default_environment_key: defaultEnvironmentKey,
        last_active_environment_key: lastActiveEnvironmentKey,
        layout_state: typeof source.layout_state === 'string' ? source.layout_state : undefined,
        completion_memory:
            source.completion_memory &&
            typeof source.completion_memory === 'object' &&
            !Array.isArray(source.completion_memory)
                ? (source.completion_memory as Project['completion_memory'])
                : undefined,
        environments: Array.isArray(source.environments)
            ? source.environments.map(environment =>
                  normalizeProjectEnvironment(
                      typeof source.id === 'string' ? source.id : '',
                      environment,
                  ),
              )
            : [],
        assets: Array.isArray(source.assets)
            ? source.assets.filter(
                  (asset): asset is ProjectAsset => !!asset && typeof asset === 'object',
              )
            : [],
    };
}

function toGatewayProject(project: Project): models.Project {
    return project as models.Project;
}

export { toEnvironmentKey, normalizeProjectEnvironment, toProject, toGatewayProject };
