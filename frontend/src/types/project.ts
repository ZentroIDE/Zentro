// SPDX-License-Identifier: GPL-3.0-only

import type { EnvironmentKey, AssetType } from '../lib/constants';
export type { EnvironmentKey, AssetType };

export interface ProjectEnvironment {
    id: string;
    project_id: string;
    key: EnvironmentKey;
    label: string;
    badge_color?: string;
    is_protected: boolean;
    is_read_only: boolean;
    /** Name of a connection in the global pool this environment is bound to.
     * Empty/undefined means the environment is not bound. */
    connection_ref?: string;
    /** Database bound for this environment on `connection_ref`'s server. */
    last_database?: string;
    last_schema?: string;
    last_catalog?: string;
}

export interface ProjectAsset {
    id: string;
    project_id: string;
    type: AssetType;
    name: string;
    description?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
}

export interface ProjectSqlCompletionMemoryEntry {
    suggestionKey: string;
    suggestionKind: string;
    contextBucket: string;
    acceptCount: number;
    lastAcceptedAt: number;
}

export interface ProjectSqlCompletionMemory {
    version: number;
    entries: ProjectSqlCompletionMemoryEntry[];
}

export interface Project {
    id: string;
    slug: string;
    name: string;
    description?: string;
    color?: string;
    storage_path?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
    last_opened_at?: string;
    default_environment_key: EnvironmentKey;
    last_active_environment_key?: EnvironmentKey;
    layout_state?: string;
    environments?: ProjectEnvironment[];
    assets?: ProjectAsset[];
    auto_commit_on_exit?: boolean;
    auto_schema_snapshots?: boolean;
    completion_memory?: ProjectSqlCompletionMemory;
}

export type StoreScope = 'local' | 'team' | 'enterprise';

export interface ScopedState<T> {
    local: T;
    team?: Record<string, T>;
    enterprise?: Record<string, T>;
}

export interface ExecutionContext {
    project_id: string;
    environment_key: string;
    connection_id: string;
    database?: string;
    schema?: string;
    tab_id?: string;
}
