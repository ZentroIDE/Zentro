// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import { models } from '../../wailsjs/go/models';

export interface SchemaNode {
    Name: string;
    Tables: string[];
    ForeignTables?: string[];
    Views: string[];
    MaterializedViews?: string[];
    Indexes?: string[];
    Functions?: string[];
    Procedures?: string[];
    Sequences?: string[];
    DataTypes?: string[];
    AggregateFunctions?: string[];
}

export interface CachedColumnEntry {
    columns: models.ColumnDef[];
    fetchedAt: number;
}

export interface CachedRelationshipEntry {
    relationships: models.TableRelationship[];
    fetchedAt: number;
}

export const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;
export const RELATIONSHIP_CACHE_TTL_MS = 5 * 60 * 1000;

interface SchemaTreeState {
    // Keyed by "ProfileName:DBName"
    trees: Record<string, SchemaNode[]>;
    // Keyed by "ProfileName:DBName:Schema:Table"
    cachedColumns: Partial<Record<string, CachedColumnEntry>>;
    cachedRelationships: Partial<Record<string, CachedRelationshipEntry>>;
    pendingColumnRequests: Partial<Record<string, Promise<models.ColumnDef[]>>>;
    pendingRelationshipRequests: Partial<Record<string, Promise<models.TableRelationship[]>>>;
    loadingKeys: Set<string>;

    setTree: (profileName: string, dbName: string, schemas: SchemaNode[]) => void;
    setLoading: (profileName: string, dbName: string, loading: boolean) => void;
    // Atomically checks-and-sets loadingKeys via get() so two components
    // mounting in the same commit (each holding its own stale `isLoading`
    // render snapshot) can't both pass the check before either's update is
    // visible. Returns false when a fetch is already in flight, in which
    // case the caller must not start another one.
    beginLoad: (profileName: string, dbName: string) => boolean;
    checkAndFetchColumns: (
        profileName: string,
        dbName: string,
        schemaName: string,
        tableName: string,
        options?: { force?: boolean; onError?: (error: unknown) => void },
    ) => Promise<models.ColumnDef[]>;
    checkAndFetchRelationships: (
        profileName: string,
        dbName: string,
        schemaName: string,
        tableName: string,
    ) => Promise<models.TableRelationship[]>;
    clearColumnCacheForDatabase: (profileName: string, dbName: string) => void;
    /** Drops every cached tree/column/relationship entry and in-flight
     *  bookkeeping. Called on project switch so a profile:db key reused by
     *  the new project's environment (or transiently populated by a stale
     *  reconnect race) can never render a tree fetched for a different
     *  project's connection before the real fetch for the new context
     *  completes. */
    resetAll: () => void;
}

function removeRecordKeysByPrefix<T>(
    source: Partial<Record<string, T>>,
    prefix: string,
): Partial<Record<string, T>> {
    const next: Partial<Record<string, T>> = {};
    Object.entries(source).forEach(([key, value]) => {
        if (!key.startsWith(prefix)) {
            next[key] = value;
        }
    });
    return next;
}

export const useSchemaStore = create<SchemaTreeState>((set, get) => ({
    trees: {},
    cachedColumns: {},
    cachedRelationships: {},
    pendingColumnRequests: {},
    pendingRelationshipRequests: {},
    loadingKeys: new Set(),

    setTree: (profileName, dbName, schemas) =>
        set(state => {
            const dbKey = `${profileName}:${dbName}`;
            const columnPrefix = `${dbKey}:`;
            return {
                trees: {
                    ...state.trees,
                    [dbKey]: schemas,
                },
                cachedColumns: removeRecordKeysByPrefix(state.cachedColumns, columnPrefix),
                cachedRelationships: removeRecordKeysByPrefix(
                    state.cachedRelationships,
                    columnPrefix,
                ),
                pendingColumnRequests: removeRecordKeysByPrefix(
                    state.pendingColumnRequests,
                    columnPrefix,
                ),
                pendingRelationshipRequests: removeRecordKeysByPrefix(
                    state.pendingRelationshipRequests,
                    columnPrefix,
                ),
                loadingKeys: new Set([...state.loadingKeys].filter(k => k !== dbKey)),
            };
        }),

    setLoading: (profileName, dbName, loading) =>
        set(state => {
            const key = `${profileName}:${dbName}`;
            const next = new Set(state.loadingKeys);
            if (loading) next.add(key);
            else next.delete(key);
            return { loadingKeys: next };
        }),

    beginLoad: (profileName, dbName) => {
        const key = `${profileName}:${dbName}`;
        if (get().loadingKeys.has(key)) return false;
        set(state => ({ loadingKeys: new Set(state.loadingKeys).add(key) }));
        return true;
    },

    clearColumnCacheForDatabase: (profileName, dbName) =>
        set(state => {
            const prefix = `${profileName}:${dbName}:`;
            return {
                cachedColumns: removeRecordKeysByPrefix(state.cachedColumns, prefix),
                cachedRelationships: removeRecordKeysByPrefix(state.cachedRelationships, prefix),
                pendingColumnRequests: removeRecordKeysByPrefix(
                    state.pendingColumnRequests,
                    prefix,
                ),
                pendingRelationshipRequests: removeRecordKeysByPrefix(
                    state.pendingRelationshipRequests,
                    prefix,
                ),
            };
        }),

    resetAll: () =>
        set({
            trees: {},
            cachedColumns: {},
            cachedRelationships: {},
            pendingColumnRequests: {},
            pendingRelationshipRequests: {},
            loadingKeys: new Set(),
        }),

    // `force` skips the TTL cache for an explicit user-triggered refresh, but
    // deliberately still joins an in-flight request: Refresh clicked twice, or
    // a refresh racing the initial load, must never put two identical
    // FetchTableColumns round trips on the wire at once.
    //
    // A failed fetch still resolves to `[]` — callers treat "no columns" as a
    // routine outcome — so `options.onError` is the channel for a caller that
    // needs to surface the failure (TableInfo drives its transient-connection
    // auto-retry off it).
    checkAndFetchColumns: async (connectionID, dbName, schemaName, tableName, options) => {
        const state = get();
        const key = `${connectionID}:${dbName}:${schemaName}:${tableName}`;
        const now = Date.now();

        const cached = state.cachedColumns[key];
        if (!options?.force && cached && now - cached.fetchedAt < COLUMN_CACHE_TTL_MS) {
            return cached.columns;
        }

        const pendingRequest = state.pendingColumnRequests[key];
        if (pendingRequest) {
            return pendingRequest;
        }

        const request = getApiGateway()
            .schema.fetchTableColumns(connectionID, dbName, schemaName, tableName)
            .then(unwrapOrThrow)
            .then(columns => {
                set(s => {
                    const nextPending = { ...s.pendingColumnRequests };
                    delete nextPending[key];
                    return {
                        cachedColumns: {
                            ...s.cachedColumns,
                            [key]: {
                                columns,
                                fetchedAt: Date.now(),
                            },
                        },
                        pendingColumnRequests: nextPending,
                    };
                });
                return columns;
            })
            .catch(error => {
                console.error(`Failed to fetch columns for ${tableName}:`, error);
                options?.onError?.(error);
                set(s => {
                    const nextPending = { ...s.pendingColumnRequests };
                    delete nextPending[key];
                    return {
                        pendingColumnRequests: nextPending,
                    };
                });
                return [];
            });

        set(s => ({
            pendingColumnRequests: {
                ...s.pendingColumnRequests,
                [key]: request,
            },
        }));

        return request;
    },

    checkAndFetchRelationships: async (connectionID, dbName, schemaName, tableName) => {
        const state = get();
        const key = `${connectionID}:${dbName}:${schemaName}:${tableName}`;
        const now = Date.now();

        const cached = state.cachedRelationships[key];
        if (cached && now - cached.fetchedAt < RELATIONSHIP_CACHE_TTL_MS) {
            return cached.relationships;
        }

        const pendingRequest = state.pendingRelationshipRequests[key];
        if (pendingRequest) {
            return pendingRequest;
        }

        const request = getApiGateway()
            .schema.fetchTableRelationships(connectionID, dbName, schemaName, tableName)
            .then(unwrapOrThrow)
            .then(relationships => {
                set(s => {
                    const nextPending = { ...s.pendingRelationshipRequests };
                    delete nextPending[key];
                    return {
                        cachedRelationships: {
                            ...s.cachedRelationships,
                            [key]: {
                                relationships,
                                fetchedAt: Date.now(),
                            },
                        },
                        pendingRelationshipRequests: nextPending,
                    };
                });
                return relationships;
            })
            .catch(error => {
                console.error(`Failed to fetch relationships for ${tableName}:`, error);
                set(s => {
                    const nextPending = { ...s.pendingRelationshipRequests };
                    delete nextPending[key];
                    return {
                        pendingRelationshipRequests: nextPending,
                    };
                });
                return [];
            });

        set(s => ({
            pendingRelationshipRequests: {
                ...s.pendingRelationshipRequests,
                [key]: request,
            },
        }));

        return request;
    },
}));
