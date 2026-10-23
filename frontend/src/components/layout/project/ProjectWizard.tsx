// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { useProjectStore } from '../../../stores/projectStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useEnvironmentStore } from '../../../stores/environmentStore';
import { useEditorStore } from '../../../stores/editorStore';
import { emitCommand } from '../../../lib/commandBus';
import { ENVIRONMENT_KEYS } from '../../../lib/projects';
import {
    DOM_EVENT,
    DRIVER,
    type ProjectHubLaunchContext,
    type ProjectWizardMode,
} from '../../../lib/constants';
import type { EnvironmentKey, Project } from '../../../types/project';
import type { ConnectionProfile } from '../../../types/connection';
import { useToast } from '../Toast';
import { DEFAULT_PROJECT_COLOR_KEY } from '../../../lib/projectColors';
import { buildTagsWithProjectIcon, getProjectIconKey } from '../projectHubMeta';
import { ProjectProfileDialog } from './ProjectProfileDialog';
import type { WizardDraftData } from './ProjectWizard.types';
import { useEnvironmentBindingState } from './useEnvironmentBindingState';
import {
    buildBoundProjectDraft,
    buildUnboundProjectDraft,
    joinPath,
    normalizePathForCompare,
    slugifyProjectName,
} from '../../../lib/projectWizardHelpers';

interface ProjectWizardProps {
    mode?: ProjectWizardMode;
    project?: Project;
    initialEnvironmentKey?: EnvironmentKey;
    launchContext?: ProjectHubLaunchContext;
    overlay?: boolean;
    /** Startup flow (no active project, no Toolbar) — lets the dialog backdrop drag the window. */
    onProjectLimitReached?: () => void;
    onClose?: () => void;
    onDone: () => void;
}

export const ProjectWizard: React.FC<ProjectWizardProps> = ({
    mode = 'create',
    project,
    initialEnvironmentKey,
    onProjectLimitReached,
    onClose,
    onDone,
}) => {
    const createProject = useProjectStore(s => s.createProject);
    const saveProject = useProjectStore(s => s.saveProject);
    const clearProjectActionError = useProjectStore(s => s.clearProjectActionError);
    const projects = useProjectStore(s => s.projects);
    const projectList = Array.isArray(projects) ? projects : [];
    const activeProject = useProjectStore(s => s.activeProject);
    const setActiveProject = useProjectStore(s => s.setActiveProject);
    const patchProject = useProjectStore(s => s.patchProject);
    const setEnvironmentLastSchema = useProjectStore(s => s.setEnvironmentLastSchema);
    const addTab = useEditorStore(s => s.addTab);
    const resetRuntime = useConnectionStore(s => s.resetRuntime);
    const setActiveEnvironment = useEnvironmentStore(s => s.setActiveEnvironment);
    const activeEnvironmentKey = useEnvironmentStore(s => s.activeEnvironmentKey);
    const { toast } = useToast();

    const isEditMode = mode === 'edit';

    const [draft, setDraft] = React.useState<WizardDraftData>({
        name: '',
        description: '',
        iconKey: 'general',
        colorKey: DEFAULT_PROJECT_COLOR_KEY,
    });
    const [submitting, setSubmitting] = React.useState(false);
    const [storageParentPath, setStorageParentPath] = React.useState('');
    const [storagePath, setStoragePath] = React.useState('');
    const [loadingStorageRoot, setLoadingStorageRoot] = React.useState(true);

    // Pool connections, for the environment matrix to pick from. New ones can
    // be added inline; edit/delete lives in Settings → Connections.
    const [connections, setConnections] = React.useState<ConnectionProfile[]>([]);
    const loadConnections = React.useCallback(async () => {
        try {
            const loaded = unwrapOrThrow(await getApiGateway().connection.loadConnections());
            setConnections(loaded || []);
        } catch (error) {
            toast.error(`Could not load connections: ${error}`);
            setConnections([]);
        }
    }, [toast]);

    React.useEffect(() => {
        void loadConnections();
    }, [loadConnections, project?.id]);

    const { draftEnvironmentBindings, handleSelectFromTreeCreate, handleUnbind } =
        useEnvironmentBindingState({
            isEditMode,
            project,
            initialEnvironmentKey,
        });

    React.useEffect(() => {
        let cancelled = false;
        setLoadingStorageRoot(true);

        getApiGateway()
            .project.getDefaultProjectStorageRoot()
            .then(result => {
                if (!cancelled && result.ok && result.data) {
                    setStorageParentPath(result.data);
                }
            })
            .catch(() => {
                /* ignore, allow manual input */
            })
            .finally(() => {
                if (!cancelled) setLoadingStorageRoot(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        if (isEditMode && project) {
            setDraft({
                name: project.name || '',
                description: project.description || '',
                iconKey: getProjectIconKey(project),
                colorKey: project.color || '',
            });
            setStoragePath(project.storage_path || '');
            return;
        }
        setDraft({
            name: '',
            description: '',
            iconKey: 'general',
            colorKey: DEFAULT_PROJECT_COLOR_KEY,
        });
        setStoragePath('');
    }, [isEditMode, project]);

    const resolveLatestEditProject = React.useCallback((): Project | null => {
        if (!project?.id) return null;
        return (
            projectList.find(item => item.id === project.id) ||
            (activeProject?.id === project.id ? activeProject : null) ||
            project
        );
    }, [activeProject, project, projectList]);

    const syncSavedProject = React.useCallback(
        (savedProject: Project) => {
            if (activeProject?.id === savedProject.id) {
                setActiveProject(savedProject);
                return;
            }
            patchProject(savedProject);
        },
        [activeProject?.id, patchProject, setActiveProject],
    );

    const handleAutoBindFromTree = React.useCallback(
        async (envKey: EnvironmentKey, profile: ConnectionProfile, database: string) => {
            const connectionRef = (profile.id || '').trim();
            const dbName = database.trim();
            if (!connectionRef || !dbName || submitting) return;

            const baseProject = resolveLatestEditProject();
            if (!baseProject) return;

            setSubmitting(true);
            try {
                const bindingDraft = buildBoundProjectDraft(
                    baseProject,
                    envKey,
                    connectionRef,
                    dbName,
                );
                const saved = await saveProject({ ...baseProject, ...bindingDraft });
                if (!saved) {
                    toast.error('Could not save environment binding.');
                    return;
                }
                syncSavedProject(saved);

                // MySQL has no schema layer separate from the database, so a
                // bound database *is* the working schema — keep last_schema
                // in step so the editor's schema context resolves.
                if (profile.driver === DRIVER.MYSQL) {
                    await setEnvironmentLastSchema(envKey, dbName);
                }

                // Rebinding the environment the app is currently connected
                // to must actually switch the live connection, not just
                // rewrite the record — otherwise the user keeps querying the
                // old database until they manually reconnect.
                if (activeProject?.id === baseProject.id && activeEnvironmentKey === envKey) {
                    try {
                        unwrapOrThrow(
                            await getApiGateway().project.connectProjectEnvironment(envKey),
                        );
                        toast.info(
                            `Reconnected ${envKey} to ${dbName} — any open transaction was rolled back.`,
                        );
                    } catch (error) {
                        toast.error(`Rebound, but reconnecting failed: ${error}`);
                    }
                }
            } catch (error) {
                toast.error(`Could not save binding: ${error}`);
            } finally {
                setSubmitting(false);
            }
        },
        [
            activeEnvironmentKey,
            activeProject?.id,
            resolveLatestEditProject,
            saveProject,
            setEnvironmentLastSchema,
            submitting,
            syncSavedProject,
            toast,
        ],
    );

    const handleSelectFromTreeEdit = React.useCallback(
        (envKey: EnvironmentKey, profile: ConnectionProfile, database: string) => {
            void handleAutoBindFromTree(envKey, profile, database);
        },
        [handleAutoBindFromTree],
    );

    const handleUnbindEnvironmentEdit = React.useCallback(
        async (envKey: EnvironmentKey) => {
            if (submitting) return;
            const baseProject = resolveLatestEditProject();
            if (!baseProject) return;

            setSubmitting(true);
            try {
                const unboundDraft = buildUnboundProjectDraft(baseProject, envKey);
                const saved = await saveProject({ ...baseProject, ...unboundDraft });
                if (!saved) {
                    toast.error('Could not remove environment binding.');
                    return;
                }
                syncSavedProject(saved);
            } catch (error) {
                toast.error(`Could not remove binding: ${error}`);
            } finally {
                setSubmitting(false);
            }
        },
        [resolveLatestEditProject, saveProject, submitting, syncSavedProject, toast],
    );

    const handleUnbindEnvironment = isEditMode ? handleUnbindEnvironmentEdit : handleUnbind;

    const handlePickStorageFolder = React.useCallback(async () => {
        try {
            const initialPath = isEditMode ? storagePath : storageParentPath;
            const picked = unwrapOrThrow(await getApiGateway().project.pickDirectory(initialPath));
            if (!picked) return;
            if (isEditMode) {
                setStoragePath(picked);
                return;
            }
            setStorageParentPath(picked);
        } catch (error) {
            toast.error(`Could not pick folder: ${error}`);
        }
    }, [isEditMode, storageParentPath, storagePath, toast]);

    const storagePathPreview = React.useMemo(() => {
        if (isEditMode) return storagePath.trim();
        const slug = slugifyProjectName(draft.name);
        return storageParentPath.trim() ? joinPath(storageParentPath, slug) : '';
    }, [draft.name, isEditMode, storageParentPath, storagePath]);

    const pathConflictProject = React.useMemo(() => {
        const preview = storagePathPreview.trim();
        if (!preview) return null;
        const normalizedPreview = normalizePathForCompare(preview);
        return (
            projectList.find(
                item =>
                    item.id !== project?.id &&
                    item.storage_path &&
                    normalizePathForCompare(item.storage_path) === normalizedPreview,
            ) || null
        );
    }, [project?.id, projectList, storagePathPreview]);

    const handleCreateAndEnter = async () => {
        // Binding an environment during creation is optional — a project can
        // start unbound and get its connections wired later from the
        // environment matrix (connections themselves are managed in
        // Settings). Only when at least one env is bound do we pick a
        // starter environment to connect to.
        const bindingEntries = ENVIRONMENT_KEYS.map(
            envKey => [envKey, draftEnvironmentBindings[envKey]] as const,
        ).filter(([, binding]) => Boolean(binding?.profile?.id && binding?.database.trim()));
        const defaultEnvKey = bindingEntries[0]?.[0];

        setSubmitting(true);
        try {
            await getApiGateway().connection.disconnect();
            resetRuntime();
            clearProjectActionError();

            const createdProject = await createProject({
                name: draft.name.trim(),
                description: draft.description.trim(),
                color: draft.colorKey || undefined,
                tags: buildTagsWithProjectIcon([], draft.iconKey),
                storage_path: storagePathPreview || undefined,
            });
            if (!createdProject) {
                const actionError = useProjectStore.getState().lastProjectActionError;
                if (actionError?.code === 'project_limit_reached') {
                    toast.error(actionError.message);
                    onProjectLimitReached?.();
                    return;
                }
                toast.error(actionError?.message || 'Could not create project.');
                return;
            }

            let finalProject = createdProject;
            if (bindingEntries.length > 0 && defaultEnvKey) {
                // createProject() sends no environments, so the backend seeds
                // one default environment on creation — drop it here rather
                // than appending the real bindings on top, or every new
                // project ends up with an extra unconfigured environment badge.
                let projectWithBindings: Project = { ...createdProject, environments: [] };
                bindingEntries.forEach(([envKey, binding]) => {
                    if (!binding?.profile?.id) return;
                    projectWithBindings = {
                        ...projectWithBindings,
                        ...buildBoundProjectDraft(
                            projectWithBindings,
                            envKey,
                            binding.profile.id,
                            binding.database.trim(),
                        ),
                    };
                });
                const createdWithBinding = await saveProject({
                    ...projectWithBindings,
                    default_environment_key: defaultEnvKey,
                    last_active_environment_key: defaultEnvKey,
                });
                if (!createdWithBinding) {
                    toast.error('Could not bind starter environment.');
                    return;
                }
                finalProject = createdWithBinding;
            }

            setActiveProject(finalProject);
            if (bindingEntries.length > 0 && defaultEnvKey) {
                try {
                    unwrapOrThrow(
                        await getApiGateway().project.connectProjectEnvironment(defaultEnvKey),
                    );
                } catch (error) {
                    toast.error(`Could not connect to starter environment: ${error}`);
                }
                setActiveEnvironment(defaultEnvKey);
            }
            onDone();
        } catch (error) {
            toast.error(`Could not finish setup: ${error}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveEdit = async () => {
        const baseProject = resolveLatestEditProject();
        if (!baseProject) {
            toast.error('Project was not found for editing.');
            return;
        }

        setSubmitting(true);
        try {
            // Edit Project only saves identity + storage. Environment
            // bindings are persisted live as they're picked
            // (handleAutoBindFromTree), and which environment is
            // default/active is owned solely by the environment switcher —
            // never touched here, so merely opening a picker can't hijack
            // the connected environment on save.
            const metadataSaved = await saveProject({
                ...baseProject,
                name: draft.name.trim(),
                description: draft.description.trim(),
                color: draft.colorKey || undefined,
                tags: buildTagsWithProjectIcon(baseProject.tags, draft.iconKey),
                storage_path: storagePathPreview || undefined,
            });
            if (!metadataSaved) {
                toast.error('Could not save project changes.');
                return;
            }
            syncSavedProject(metadataSaved);
            onDone();
        } catch (error) {
            toast.error(`Could not finish setup: ${error}`);
        } finally {
            setSubmitting(false);
        }
    };

    // "Manage connections" (edit/delete/import/export) routes to Settings.
    const handleManageConnections = React.useCallback(() => {
        addTab({ type: 'settings', name: 'Settings', content: 'settings-connections' });
        emitCommand(DOM_EVENT.OPEN_SETTINGS_SECTION, { section: 'settings-connections' });
        if (onClose) onClose();
        else onDone();
    }, [addTab, onClose, onDone]);

    return (
        <ProjectProfileDialog
            mode={isEditMode ? 'edit' : 'create'}
            draft={draft}
            editingProjectId={isEditMode ? project?.id : undefined}
            editProject={isEditMode ? resolveLatestEditProject() : null}
            onDraftChange={setDraft}
            storageParentPath={storageParentPath}
            storagePath={storagePath}
            storagePathPreview={storagePathPreview}
            loadingStorageRoot={loadingStorageRoot}
            pathConflictProject={pathConflictProject}
            onStorageChange={isEditMode ? setStoragePath : setStorageParentPath}
            onPickFolder={handlePickStorageFolder}
            connections={connections}
            onSetActiveEnvKey={() => {}}
            draftEnvironmentBindings={draftEnvironmentBindings}
            onBind={isEditMode ? handleSelectFromTreeEdit : handleSelectFromTreeCreate}
            onUnbind={handleUnbindEnvironment}
            connectionPanel={{ onManageConnections: handleManageConnections }}
            submitting={submitting}
            onConnectionCreated={loadConnections}
            onCancel={onClose ?? (() => onDone())}
            onSubmit={isEditMode ? handleSaveEdit : handleCreateAndEnter}
        />
    );
};
