// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { models } from '../../../wailsjs/go/models';
import type { app } from '../../../wailsjs/go/models';
import { useToast } from '../../components/layout/Toast';
import { useConnectionForm } from '../../hooks/useConnectionForm';
import { useConnectionDatabases } from '../../components/layout/project/useConnectionDatabases';
import type { ConnectionProfile } from '../../types/connection';

/** Synthetic importer key for "import connections from a JSON file". */
const FILE_IMPORTER_KEY = 'file';

/**
 * Owns everything the Settings → Connections page needs: the pool list, the
 * create/edit form, delete (with usage lookup), per-connection database
 * listing + create, and import/export. This is the *only* connection-CRUD
 * surface — project environment matrices just pick from the list it manages.
 */
export function useConnectionManager() {
    const { toast } = useToast();
    const databases = useConnectionDatabases();

    const [connections, setConnections] = React.useState<ConnectionProfile[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [formOpen, setFormOpen] = React.useState(false);
    const [editingProfile, setEditingProfile] = React.useState<ConnectionProfile | null>(null);

    const [deleteTarget, setDeleteTarget] = React.useState<ConnectionProfile | null>(null);
    const [deleting, setDeleting] = React.useState(false);

    // Which project environments bind which database, per connection id.
    const [usageById, setUsageById] = React.useState<Record<string, app.ConnectionUsageRef[]>>({});

    const [creatingDb, setCreatingDb] = React.useState(false);

    // Tool / file import sheet (reuses the project wizard's sheet component).
    const [importOpen, setImportOpen] = React.useState(false);
    const [importConnections, setImportConnections] = React.useState<ConnectionProfile[]>([]);
    const [availableImporters, setAvailableImporters] = React.useState<app.ImporterInfo[]>([]);
    const [selectedImporterKey, setSelectedImporterKey] = React.useState<string | null>(null);
    const [importing, setImporting] = React.useState(false);
    const [exportOpen, setExportOpen] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    const loadUsage = React.useCallback(async (list: ConnectionProfile[]) => {
        const withId = list.filter((c): c is ConnectionProfile & { id: string } => Boolean(c.id));
        const results = await Promise.all(
            withId.map(async c => {
                const res = await getApiGateway().connection.listConnectionUsage(c.id);
                return [c.id, res.ok ? (res.data ?? []) : []] as const;
            }),
        );
        setUsageById(Object.fromEntries(results));
    }, []);

    const reload = React.useCallback(async () => {
        setLoading(true);
        try {
            const loaded = unwrapOrThrow(await getApiGateway().connection.loadConnections());
            const next = loaded || [];
            setConnections(next);
            databases.loadAll(next);
            void loadUsage(next);
            return next;
        } catch (error) {
            toast.error(`Could not load connections: ${error}`);
            setConnections([]);
            return [] as ConnectionProfile[];
        } finally {
            setLoading(false);
        }
    }, [databases, loadUsage, toast]);

    React.useEffect(() => {
        void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const existingNames = React.useMemo(
        () => connections.map(c => c.name).filter(Boolean),
        [connections],
    );

    const form = useConnectionForm({
        profile: editingProfile,
        isOpen: formOpen,
        existingNames,
        onSaved: async () => {
            await reload();
            setFormOpen(false);
            setEditingProfile(null);
            toast.success(editingProfile ? 'Connection updated.' : 'Connection created.');
        },
        onClose: () => {
            setFormOpen(false);
            setEditingProfile(null);
        },
    });

    const openCreate = React.useCallback(() => {
        setEditingProfile(null);
        setFormOpen(true);
        form.resetForm();
    }, [form]);

    const openEdit = React.useCallback((profile: ConnectionProfile) => {
        setEditingProfile(profile);
        setFormOpen(true);
    }, []);

    const closeForm = React.useCallback(() => {
        setFormOpen(false);
        setEditingProfile(null);
    }, []);

    const requestDelete = React.useCallback((profile: ConnectionProfile) => {
        setDeleteTarget(profile);
    }, []);

    const cancelDelete = React.useCallback(() => setDeleteTarget(null), []);

    const confirmDelete = React.useCallback(async () => {
        const target = deleteTarget;
        if (!target?.id) return;
        setDeleting(true);
        try {
            unwrapOrThrow(await getApiGateway().connection.deleteConnection(target.id));
            await reload();
            toast.success(`Deleted connection "${target.name}".`);
        } catch (error) {
            toast.error(`Could not delete connection: ${error}`);
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    }, [deleteTarget, reload, toast]);

    const deleteUsage = deleteTarget?.id ? (usageById[deleteTarget.id] ?? []) : [];

    const createDatabase = React.useCallback(
        async (profile: ConnectionProfile, dbName: string) => {
            const name = dbName.trim();
            if (!name) return;
            setCreatingDb(true);
            try {
                unwrapOrThrow(
                    await getApiGateway().connection.createDatabase(
                        new models.ConnectionProfile(profile),
                        name,
                    ),
                );
                toast.success(`Database "${name}" created.`);
                await databases.load(profile);
            } catch (error) {
                toast.error(`Could not create database: ${error}`);
            } finally {
                setCreatingDb(false);
            }
        },
        [databases, toast],
    );

    const closeImport = React.useCallback(() => {
        setImportOpen(false);
        setImportConnections([]);
        setAvailableImporters([]);
        setSelectedImporterKey(null);
    }, []);

    const importFromFile = React.useCallback(async () => {
        setImporting(true);
        try {
            const imported = unwrapOrThrow(
                await getApiGateway().connection.importConnectionsFromFile(),
            );
            if (imported === null) return; // user cancelled
            if (imported.length === 0) {
                toast.error('No connections found in that file.');
                return;
            }
            setAvailableImporters([]);
            setSelectedImporterKey(FILE_IMPORTER_KEY);
            setImportConnections(imported);
            setImportOpen(true);
        } catch (error) {
            toast.error(`Could not import connections: ${error}`);
        } finally {
            setImporting(false);
        }
    }, [toast]);

    const importFromTool = React.useCallback(async () => {
        setImporting(true);
        try {
            const importers = unwrapOrThrow(
                await getApiGateway().connection.listConnectionImporters(),
            );
            if (!importers || importers.length === 0) {
                toast.error('No external-tool importers are available.');
                return;
            }
            setAvailableImporters(importers);
            if (importers.length === 1) {
                const imported = unwrapOrThrow(
                    await getApiGateway().connection.importConnectionsFromTool(
                        importers[0].key,
                        '',
                    ),
                );
                if (imported === null) {
                    toast.error(
                        `${importers[0].name} workspace not found. Make sure ${importers[0].name} is installed.`,
                    );
                    return;
                }
                if (imported.length === 0) {
                    toast.error(`No supported connections found in ${importers[0].name}.`);
                    return;
                }
                setImportConnections(imported);
                setSelectedImporterKey(importers[0].key);
            }
            setImportOpen(true);
        } catch (error) {
            toast.error(`Could not load importers: ${error}`);
        } finally {
            setImporting(false);
        }
    }, [toast]);

    const selectImporter = React.useCallback(
        async (key: string) => {
            try {
                const imported = unwrapOrThrow(
                    await getApiGateway().connection.importConnectionsFromTool(key, ''),
                );
                const toolName = availableImporters.find(i => i.key === key)?.name ?? key;
                if (imported === null) {
                    toast.error(
                        `${toolName} workspace not found. Make sure ${toolName} is installed.`,
                    );
                    return;
                }
                if (imported.length === 0) {
                    toast.error(`No supported connections found in ${toolName}.`);
                    return;
                }
                setImportConnections(imported);
                setSelectedImporterKey(key);
            } catch (error) {
                toast.error(`Could not import connections: ${error}`);
            }
        },
        [availableImporters, toast],
    );

    const confirmImport = React.useCallback(
        async (selected: ConnectionProfile[]) => {
            if (selected.length === 0) return;
            try {
                for (const profile of selected) {
                    unwrapOrThrow(
                        await getApiGateway().connection.saveConnection(
                            new models.ConnectionProfile(profile),
                        ),
                    );
                }
                await reload();
                toast.success(
                    `Imported ${selected.length} connection${selected.length === 1 ? '' : 's'}.`,
                );
            } catch (error) {
                toast.error(`Could not import connections: ${error}`);
            } finally {
                closeImport();
            }
        },
        [closeImport, reload, toast],
    );

    const exportSelected = React.useCallback(
        async (names: string[]) => {
            setExporting(true);
            try {
                const path = unwrapOrThrow(
                    await getApiGateway().connection.exportConnectionsBundle(names),
                );
                if (path) toast.success(`Connections exported: ${path}`);
            } catch (error) {
                toast.error(`Could not export connections: ${error}`);
            } finally {
                setExporting(false);
                setExportOpen(false);
            }
        },
        [toast],
    );

    return {
        connections,
        loading,
        databases,
        usageById,
        reload,

        form,
        formOpen,
        editingProfile,
        openCreate,
        openEdit,
        closeForm,

        deleteTarget,
        deleteUsage,
        deleting,
        requestDelete,
        confirmDelete,
        cancelDelete,

        creatingDb,
        createDatabase,

        importOpen,
        importConnections,
        availableImporters,
        selectedImporterKey,
        importing,
        importFromFile,
        importFromTool,
        selectImporter,
        confirmImport,
        closeImport,

        exportOpen,
        exporting,
        openExport: () => setExportOpen(true),
        closeExport: () => setExportOpen(false),
        exportSelected,
    };
}
