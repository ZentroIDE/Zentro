// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { getErrorMessage } from '../../../lib/errors';
import { models } from '../../../../wailsjs/go/models';
import type { ConnectionProfile } from '../../../types/connection';

interface ConnectionDatabasesEntry {
    databases: string[];
    loading: boolean;
    /** Set only when the fetch failed; the caller decides how to fall back
     * (e.g. showing the profile's own db_name as the sole option). */
    error: string | null;
}

const EMPTY_ENTRY: ConnectionDatabasesEntry = { databases: [], loading: false, error: null };

/**
 * Lazily fetches the live list of databases for each connection profile,
 * keyed by profile name. Same backend call DatabaseTreePicker uses
 * (connection.loadDatabasesForConnection), extracted into a hook so the
 * project profile's combined bind picker can reuse the data-fetching without
 * depending on DatabaseTreePicker's own tree/expand-state UI.
 */
export function useConnectionDatabases() {
    const [byName, setByName] = React.useState<Record<string, ConnectionDatabasesEntry>>({});
    const inFlightRef = React.useRef<Set<string>>(new Set());

    const load = React.useCallback(async (profile: ConnectionProfile) => {
        const name = profile.name?.trim();
        if (!name || inFlightRef.current.has(name)) return;
        inFlightRef.current.add(name);
        setByName(current => ({
            ...current,
            [name]: { databases: current[name]?.databases || [], loading: true, error: null },
        }));

        try {
            const databases = unwrapOrThrow(
                await getApiGateway().connection.loadDatabasesForConnection(
                    new models.ConnectionProfile(profile),
                ),
            );
            setByName(current => ({
                ...current,
                [name]: { databases: databases || [], loading: false, error: null },
            }));
        } catch (error) {
            setByName(current => ({
                ...current,
                [name]: { databases: [], loading: false, error: getErrorMessage(error) },
            }));
        } finally {
            inFlightRef.current.delete(name);
        }
    }, []);

    const loadAll = React.useCallback(
        (profiles: ConnectionProfile[]) => {
            profiles.forEach(profile => {
                void load(profile);
            });
        },
        [load],
    );

    const getEntry = React.useCallback(
        (profileName: string): ConnectionDatabasesEntry => byName[profileName] || EMPTY_ENTRY,
        [byName],
    );

    return { getEntry, load, loadAll };
}
