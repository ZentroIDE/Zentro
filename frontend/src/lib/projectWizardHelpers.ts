// SPDX-License-Identifier: GPL-3.0-only

import { ENVIRONMENT_KEY } from './constants';
import { getEnvironmentMeta } from './projects';
import type { EnvironmentKey, Project } from '../types/project';

/**
 * Pure helpers used by the ProjectWizard. Extracted so they can be tested in
 * isolation — none of these touch React, stores, or the Wails bridge.
 *
 * Connections live in a single global pool. A project's environments only
 * reference a pool connection by name (`connection_ref`) plus the bound
 * database (`last_database`).
 */

/**
 * Convert a free-form project name into a slug suitable for a path segment.
 * Lower-cases, replaces non-alphanumeric runs with a single dash, and trims
 * leading/trailing dashes. Returns `"project"` for empty or fully-non-alpha
 * input.
 */
export function slugifyProjectName(value: string): string {
    const input = value.trim().toLowerCase();
    if (!input) return 'project';

    let result = '';
    let lastDash = false;
    for (const char of input) {
        if ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')) {
            result += char;
            lastDash = false;
            continue;
        }
        if (!lastDash) {
            result += '-';
            lastDash = true;
        }
    }

    const trimmed = result.replace(/^-+|-+$/g, '');
    return trimmed || 'project';
}

/**
 * Join a parent directory with a child segment, preserving whichever path
 * separator the parent already uses. Returns empty string if `parent` is
 * blank — caller decides what to do with no root.
 */
export function joinPath(parent: string, child: string): string {
    const base = parent.trim();
    if (!base) return '';
    const separator = base.includes('\\') ? '\\' : '/';
    const normalized = base.replace(/[\\/]+$/, '');
    return `${normalized}${separator}${child}`;
}

/**
 * Normalise a path for case-insensitive equality comparison: collapse mixed
 * separators to a single backslash, strip trailing separators, lower-case.
 * Use for "are these the same folder?" checks; do NOT use to write paths.
 */
export function normalizePathForCompare(value: string): string {
    return value
        .trim()
        .replace(/[\\/]+/g, '\\')
        .replace(/\\+$/, '')
        .toLowerCase();
}

/**
 * Pick the environment to land on when entering edit mode: project's
 * last-active env wins, then the project's default, then Development.
 */
export function resolveDefaultEnvironment(project?: Project): EnvironmentKey {
    return (project?.last_active_environment_key ||
        project?.default_environment_key ||
        ENVIRONMENT_KEY.DEVELOPMENT) as EnvironmentKey;
}

/**
 * Bind a pool connection (by name) + database to one environment, returning a
 * partial project containing the next `environments` array. Idempotent:
 * re-binding the same env overwrites in place; binding a not-yet-present env
 * appends a fresh record with sensible defaults. The caller merges the partial
 * back into the project.
 */
export function buildBoundProjectDraft(
    project: Project,
    environmentKey: EnvironmentKey,
    connectionName: string,
    database: string,
): Pick<Project, 'environments'> {
    const existing = project.environments || [];
    const environments = existing.some(environment => environment.key === environmentKey)
        ? existing.map(environment =>
              environment.key === environmentKey
                  ? {
                        ...environment,
                        connection_ref: connectionName,
                        last_database: database,
                    }
                  : environment,
          )
        : [
              ...existing,
              {
                  id: crypto.randomUUID(),
                  project_id: project.id,
                  key: environmentKey,
                  label: getEnvironmentMeta(environmentKey).label,
                  badge_color: environmentKey,
                  is_protected:
                      environmentKey === ENVIRONMENT_KEY.STAGING ||
                      environmentKey === ENVIRONMENT_KEY.PRODUCTION,
                  is_read_only: environmentKey === ENVIRONMENT_KEY.PRODUCTION,
                  connection_ref: connectionName,
                  last_database: database,
              },
          ];

    return { environments };
}

/**
 * Unbind one environment — clears its `connection_ref` and `last_database`.
 * Counterpart to {@link buildBoundProjectDraft}. No-op for an env that isn't
 * present. The caller merges the partial back into the project.
 */
export function buildUnboundProjectDraft(
    project: Project,
    environmentKey: EnvironmentKey,
): Pick<Project, 'environments'> {
    return {
        environments: (project.environments || []).map(environment =>
            environment.key === environmentKey
                ? { ...environment, connection_ref: undefined, last_database: undefined }
                : environment,
        ),
    };
}
