// SPDX-License-Identifier: GPL-3.0-only

export type ProjectServiceErrorCode =
    | 'project_limit_reached'
    | 'project_path_conflict'
    | 'project_import_invalid'
    | 'not_a_project'
    | 'project_locked'
    | 'unknown';

export class ProjectServiceError extends Error {
    constructor(
        message: string,
        public readonly code: ProjectServiceErrorCode,
        public readonly causeValue?: unknown,
    ) {
        super(message);
        this.name = 'ProjectServiceError';
    }
}

export function normalizeProjectServiceError(error: unknown): ProjectServiceError {
    if (error instanceof ProjectServiceError) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.trim();
    const lower = normalizedMessage.toLowerCase();

    if (lower.includes('free plan limit:')) {
        return new ProjectServiceError(normalizedMessage, 'project_limit_reached', error);
    }

    if (lower.includes('storage path already belongs to another project')) {
        return new ProjectServiceError(normalizedMessage, 'project_path_conflict', error);
    }

    if (lower.includes('already open in another zentro window')) {
        return new ProjectServiceError(normalizedMessage, 'project_locked', error);
    }

    // Mirrors app.ErrNotZentroProject — the folder has no project.json.
    if (lower.includes('not a zentro project')) {
        return new ProjectServiceError(normalizedMessage, 'not_a_project', error);
    }

    if (
        lower.includes('read project manifest:') ||
        lower.includes('parse project manifest:') ||
        lower.includes('project directory is required')
    ) {
        return new ProjectServiceError(normalizedMessage, 'project_import_invalid', error);
    }

    return new ProjectServiceError(normalizedMessage, 'unknown', error);
}
