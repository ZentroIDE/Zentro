// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from 'react';
import { appLogger } from '../../lib/logger';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useEditorStore } from '../../stores/editorStore';
import { useScriptStore } from '../../stores/scriptStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { CONNECTION_STATUS } from '../../lib/constants';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { recoverStartupState } from './startupRecovery';
import { createProjectSessionCoordinator } from './projectSessionCoordinator';
import { serializeProjectEditorSession, withProjectLayoutState } from './projectSessionCodec';

export function useProjectLifecycle() {
    const bootstrapProjects = useProjectStore(state => state.bootstrap);
    const activeProject = useProjectStore(state => state.activeProject);
    const isSwitchingProject = useProjectStore(state => state.isSwitchingProject);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const isSwitchingEnvironment = useEnvironmentStore(state => state.isSwitching);
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const connectionStatus = useConnectionStore(state => state.connectionStatus);
    const setConnections = useConnectionStore(state => state.setConnections);
    const poolConnections = useConnectionStore(state => state.connections);
    // ProjectEnvironment.connection_ref is a pool connection ID; the schema
    // tree cache and every other FE consumer keys by the display name, so
    // resolve it here.
    const connectionNameById = useCallback(
        (id: string | undefined) =>
            id ? ((poolConnections ?? []).find(c => c.id === id)?.name ?? null) : null,
        [poolConnections],
    );
    const setStatusMessage = useStatusStore(state => state.setMessage);
    const groups = useEditorStore(state => state.groups);
    const activeGroupId = useEditorStore(state => state.activeGroupId);
    const activeEditorProjectId = useEditorStore(state => state.activeProjectId);
    const loadScripts = useScriptStore(state => state.loadScripts);
    const schemaTrees = useSchemaStore(state => state.trees);
    const schemaLoadingKeys = useSchemaStore(state => state.loadingKeys);
    const setSchemaLoading = useSchemaStore(state => state.setLoading);
    const connectAttemptRef = useRef<string>('');
    const failedAutoConnectKeysRef = useRef<Set<string>>(new Set());
    const lastAutoConnectProjectIdRef = useRef<string | null>(null);
    const pendingSessionSaveRef = useRef<{
        projectId: string;
        serialized: string;
    } | null>(null);
    const sessionSaveTimerRef = useRef<number | null>(null);
    const lastPersistedLayoutRef = useRef<Record<string, string>>({});
    const hasBootstrappedRef = useRef(false);

    const flushPendingSessionSave = () => {
        if (!pendingSessionSaveRef.current) return;
        const pending = pendingSessionSaveRef.current;
        if (sessionSaveTimerRef.current !== null) {
            window.clearTimeout(sessionSaveTimerRef.current);
            sessionSaveTimerRef.current = null;
        }

        const state = useProjectStore.getState();
        const active = state.activeProject;
        const sourceProject =
            active && active.id === pending.projectId
                ? active
                : state.projects.find(project => project.id === pending.projectId) || null;
        if (!sourceProject) {
            pendingSessionSaveRef.current = null;
            return;
        }

        const nextProject = withProjectLayoutState(sourceProject, pending.serialized);
        void state.saveProject(nextProject).then(saved => {
            if (!saved) return;
            lastPersistedLayoutRef.current[pending.projectId] = pending.serialized;
        });
        pendingSessionSaveRef.current = null;
    };

    useEffect(() => {
        // Guard against StrictMode's dev-mode double-invoke: bootstrap has a
        // one-shot side effect on the backend (GetLaunchProjectID is consumed
        // on first read), so running it twice silently drops the launch
        // project id and other one-time startup state on the second call.
        if (hasBootstrappedRef.current) return;
        hasBootstrappedRef.current = true;

        const recoveryReport = recoverStartupState();
        if (recoveryReport.warnings.length > 0) {
            recoveryReport.warnings.forEach(warning => appLogger.warn(warning));
            setStatusMessage('Recovered corrupted local state during startup.');
        }

        useSettingsStore.getState().load();
        bootstrapProjects().catch(error => {
            appLogger.warn('project bootstrap failed', error);
        });
    }, [bootstrapProjects, setStatusMessage]);

    useEffect(() => {
        const preloadConnections = async () => {
            try {
                const connections = unwrapOrThrow(
                    await getApiGateway().connection.loadConnections(),
                );
                setConnections(connections || []);

                const runtime = unwrapOrThrow(
                    await getApiGateway().connection.getConnectionStatus(),
                );
                const store = useConnectionStore.getState();
                if (runtime?.status === CONNECTION_STATUS.CONNECTED && runtime.profile) {
                    store.setActiveProfile(runtime.profile);
                    store.setIsConnected(true);
                    store.setConnectionStatus(CONNECTION_STATUS.CONNECTED);
                    return;
                }

                if (runtime?.status === CONNECTION_STATUS.CONNECTING && runtime.profile) {
                    store.setActiveProfile(runtime.profile);
                    store.setIsConnected(false);
                    store.setConnectionStatus(CONNECTION_STATUS.CONNECTING);
                    return;
                }

                store.resetRuntime();
            } catch (error) {
                appLogger.warn('background connection preload failed', error);
            }
        };

        void preloadConnections();
    }, [setConnections]);

    useEffect(() => {
        const coordinator = createProjectSessionCoordinator({
            onBeforeSwitch: () => flushPendingSessionSave(),
            onSessionHydrated: (projectId, serializedLayout) => {
                lastPersistedLayoutRef.current[projectId] = serializedLayout;
            },
        });
        return coordinator.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const projectId = activeProject?.id;
        if (!projectId) return;
        if (activeEditorProjectId !== projectId) return;

        const serialized = serializeProjectEditorSession({
            groups,
            activeGroupId,
        });
        if (lastPersistedLayoutRef.current[projectId] === serialized) return;

        pendingSessionSaveRef.current = { projectId, serialized };
        if (sessionSaveTimerRef.current !== null) {
            window.clearTimeout(sessionSaveTimerRef.current);
        }

        sessionSaveTimerRef.current = window.setTimeout(() => {
            flushPendingSessionSave();
        }, 600);

        return () => {
            if (sessionSaveTimerRef.current !== null) {
                window.clearTimeout(sessionSaveTimerRef.current);
                sessionSaveTimerRef.current = null;
            }
        };
    }, [activeEditorProjectId, activeGroupId, activeProject?.id, groups]);

    useEffect(
        () => () => {
            flushPendingSessionSave();
        },
        [],
    );

    useEffect(() => {
        const handleBeforeUnload = () => {
            flushPendingSessionSave();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    useEffect(() => {
        // Never second-guess a connect that's already in flight — whoever
        // started it (an explicit switch, a manual reconnect, this effect
        // itself on an earlier run) owns the outcome.
        if (connectionStatus === CONNECTION_STATUS.CONNECTING) return;
        // Also stay out of the way for the entire span of an explicit
        // switch (see environmentStore.ts's isSwitching), not just while
        // connectionStatus reads Connecting. connectionStore.activeProfile
        // flips to the new target as soon as the backend's Connecting event
        // lands, and connectionStatus itself flips to Connected once the
        // backend replies — both *before* environmentStore.activeEnvironmentKey
        // catches up (that only happens after the whole switch resolves).
        // For that render, this effect would see "activeProfile says
        // Production, activeEnvironmentKey still says Staging, status is
        // already Connected" and — without this guard — "fix" it by
        // reconnecting back to Staging, racing the switch already in
        // progress and producing the flicker between environments the user
        // saw. See useProjectLifecycle.test.ts for the regression case.
        if (isSwitchingEnvironment) return;
        // Same reasoning as the isSwitchingEnvironment guard above, but for
        // the wider span of a project switch (see projectStore's
        // isSwitchingProject doc comment): the outgoing disconnect's
        // Disconnected event flips connectionStatus while activeProject
        // still refers to the project being left, so this effect would
        // otherwise resolve targetEnvironmentKey against the OLD project's
        // environments and reconnect to its connection instead.
        if (isSwitchingProject) return;

        const currentProjectId = activeProject?.id ?? null;
        if (lastAutoConnectProjectIdRef.current !== currentProjectId) {
            // A new project is an explicit user action — it deserves a fresh
            // connect attempt, not silence because some environment (maybe
            // even a different one, still keyed by the OLD project's id)
            // failed earlier this session. Without this, failedAutoConnectKeysRef
            // permanently muted every future switch back into a project that
            // had ever failed once, leaving activeProfile stuck at null
            // (toolbar shows "No server / No database") instead of showing
            // the target's real host/db alongside the connection error.
            failedAutoConnectKeysRef.current.clear();
            lastAutoConnectProjectIdRef.current = currentProjectId;
        }

        const targetEnvironmentKey =
            activeEnvironmentKey ||
            activeProject?.last_active_environment_key ||
            activeProject?.default_environment_key;
        if (!activeProject || !targetEnvironmentKey) return;

        const environment = activeProject.environments?.find(
            item => item.key === targetEnvironmentKey,
        );
        const connectionRef = environment?.connection_ref;
        const profileName = connectionNameById(connectionRef);
        const dbName = environment?.last_database;
        const targetDbName = dbName || '';

        if (!connectionRef) return;

        const targetKey = `${activeProject.id}:${targetEnvironmentKey}:${connectionRef}:${targetDbName}`;
        const isSameProfile = activeProfile?.id === connectionRef;
        const isSameDatabase = !targetDbName || (activeProfile?.db_name || '') === targetDbName;

        if (isSameProfile && isSameDatabase && connectionStatus === CONNECTION_STATUS.CONNECTED) {
            connectAttemptRef.current = targetKey;
            failedAutoConnectKeysRef.current.delete(targetKey);
            return;
        }

        if (isSameProfile && isSameDatabase && connectionStatus === CONNECTION_STATUS.ERROR) {
            failedAutoConnectKeysRef.current.add(targetKey);
            return;
        }

        if (failedAutoConnectKeysRef.current.has(targetKey)) {
            return;
        }

        connectAttemptRef.current = targetKey;

        const doConnect = async () => {
            if (activeProject?.id !== currentProjectId) return;
            try {
                unwrapOrThrow(
                    await getApiGateway().project.connectProjectEnvironment(targetEnvironmentKey),
                );
                setStatusMessage('');
            } catch (error) {
                failedAutoConnectKeysRef.current.add(targetKey);
                appLogger.warn('auto reconnect failed', {
                    envKey: targetEnvironmentKey,
                    profileName,
                    error,
                });
            }
        };

        void doConnect();
    }, [
        activeEnvironmentKey,
        activeProfile?.db_name,
        activeProfile?.id,
        activeProject,
        connectionNameById,
        connectionStatus,
        isSwitchingEnvironment,
        isSwitchingProject,
        setStatusMessage,
    ]);

    useEffect(() => {
        const projectId = activeProject?.id;
        const connectionName = activeProfile?.name;
        if (!projectId || !connectionName) return;
        loadScripts(projectId, connectionName).catch(error => {
            appLogger.warn('preload scripts failed', {
                projectId,
                connectionName,
                error,
            });
        });
    }, [activeProfile?.name, activeProject?.id, loadScripts]);

    useEffect(() => {
        const targetEnvironmentKey =
            activeEnvironmentKey ||
            activeProject?.last_active_environment_key ||
            activeProject?.default_environment_key;
        if (
            !activeProject ||
            !targetEnvironmentKey ||
            connectionStatus !== CONNECTION_STATUS.CONNECTED ||
            !activeProfile?.name ||
            !activeProfile?.db_name
        ) {
            return;
        }

        const boundEnvironment = activeProject.environments?.find(
            item => item.key === targetEnvironmentKey,
        );
        const targetProfileName = connectionNameById(boundEnvironment?.connection_ref);
        const targetDbName = boundEnvironment?.last_database || activeProfile.db_name;
        if (!targetProfileName || !targetDbName) return;
        if (activeProfile.name !== targetProfileName || activeProfile.db_name !== targetDbName)
            return;

        const schemaKey = `${targetProfileName}:${targetDbName}`;
        if (schemaTrees[schemaKey] || schemaLoadingKeys.has(schemaKey)) return;

        setSchemaLoading(targetProfileName, targetDbName, true);
        getApiGateway()
            .schema.fetchDatabaseSchema(targetProfileName, targetDbName)
            .then(unwrapOrThrow)
            .catch(error => {
                setSchemaLoading(targetProfileName, targetDbName, false);
                appLogger.warn('background schema preload failed', {
                    projectId: activeProject.id,
                    envKey: targetEnvironmentKey,
                    profileName: targetProfileName,
                    dbName: targetDbName,
                    error,
                });
            });
    }, [
        activeEnvironmentKey,
        activeProfile?.db_name,
        activeProfile?.name,
        activeProject,
        connectionNameById,
        connectionStatus,
        schemaLoadingKeys,
        schemaTrees,
        setSchemaLoading,
    ]);
}
