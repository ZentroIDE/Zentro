// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Database,
    FileInput,
    FolderInput,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Upload,
} from 'lucide-react';

import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    ConfirmDialog,
    Input,
    Spinner,
} from '../../ui';
import { cn } from '../../../lib/cn';
import { getProvider } from '../../../lib/providers';
import { getEnvironmentShortLabel } from '../../../lib/projects';
import { resolveProjectColor } from '../../../lib/projectColors';
import { useProjectStore } from '../../../stores/projectStore';
import { EnvironmentBadge } from '../../shared/EnvironmentBadge';
import { ConnectionEditorPanel } from '../../connection';
import { ToolImportSheet } from './ToolImportSheet';
import { ToolExportSheet } from './ToolExportSheet';
import { useConnectionManager } from '../../../features/connection/useConnectionManager';
import type { ConnectionProfile } from '../../../types/connection';

interface ConnectionProbe {
    loading: boolean;
    error: string | null;
    databases: string[];
}

const StatusDot: React.FC<{ entry: ConnectionProbe }> = ({ entry }) => {
    const { tone, label } = entry.loading
        ? { tone: 'bg-warning animate-pulse', label: 'Checking connection…' }
        : entry.error
          ? { tone: 'bg-destructive', label: `Unreachable — ${entry.error}` }
          : entry.databases.length > 0
            ? { tone: 'bg-success', label: 'Reachable' }
            : { tone: 'bg-muted-foreground/40', label: 'Not checked yet' };
    return (
        <span
            aria-label={label}
            title={label}
            className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', tone)}
        />
    );
};

const connectionEndpoint = (c: ConnectionProfile): string => {
    if (!c.host) return '';
    const hostPort = `${c.host}${c.port ? `:${c.port}` : ''}`;
    return c.username ? `${c.username}@${hostPort}` : hostPort;
};

export const SettingsConnections: React.FC = () => {
    const m = useConnectionManager();
    const projects = useProjectStore(state => state.projects);
    const loadProjects = useProjectStore(state => state.loadProjects);
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [newDbName, setNewDbName] = React.useState('');
    const [refreshing, setRefreshing] = React.useState(false);

    // The "bound by" column reads the project name/color live from the store
    // so a rename elsewhere shows here without an app restart — the usage
    // payload's own project_name is only the fallback for a project the
    // store hasn't loaded yet.
    const projectById = React.useMemo(() => {
        const map = new Map<string, (typeof projects)[number]>();
        for (const project of projects) map.set(project.id, project);
        return map;
    }, [projects]);

    const handleRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([m.reload(), loadProjects()]);
        } finally {
            setRefreshing(false);
        }
    }, [loadProjects, m]);

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Database}
                title='Connections'
                description='Server gateways shared across every project. A project picks a database per environment; it never edits the gateway here.'
            />

            <div className={SettingsClasses.sectionContent}>
                <div className='flex flex-wrap items-center gap-2'>
                    <Button size='sm' variant='default' onClick={m.openCreate} className='gap-1.5'>
                        <Plus size={13} />
                        New connection
                    </Button>
                    <Button
                        variant='ghost'
                        onClick={() => void handleRefresh()}
                        disabled={refreshing || m.loading}
                        title='Reload connections, databases and project bindings'
                        className='gap-1.5'
                    >
                        {refreshing ? <Spinner size={12} /> : <RefreshCw size={13} />}
                        Refresh
                    </Button>
                    <div className='flex-1' />
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={() => void m.importFromFile()}
                        disabled={m.importing}
                        className='gap-1.5'
                    >
                        {m.importing ? <Spinner size={12} /> : <FileInput size={13} />}
                        Import file
                    </Button>
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={() => void m.importFromTool()}
                        disabled={m.importing}
                        className='gap-1.5'
                    >
                        <FolderInput size={13} />
                        Import from tool
                    </Button>
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={m.openExport}
                        disabled={m.connections.length === 0}
                        className='gap-1.5'
                    >
                        <Upload size={13} />
                        Export
                    </Button>
                </div>

                {m.loading ? (
                    <div className='px-2 py-6 text-center text-label text-muted-foreground'>
                        Loading connections…
                    </div>
                ) : m.connections.length === 0 ? (
                    <div className='rounded-md border border-dashed border-(--border-panel) px-3 py-8 text-center text-label text-muted-foreground'>
                        No connections yet. Add one to bind it to a project environment.
                    </div>
                ) : (
                    <div className='flex flex-col gap-1'>
                        {m.connections.map(profile => {
                            const provider = getProvider(profile.driver);
                            const entry = m.databases.getEntry(profile.name);
                            const isExpanded = expandedId === profile.id;
                            const endpoint = connectionEndpoint(profile);
                            const usage = (profile.id && m.usageById[profile.id]) || [];
                            const boundDbNames = usage
                                .map(u => u.database)
                                .filter((db): db is string => Boolean(db));
                            const allDbNames = [
                                ...new Set([...entry.databases, ...boundDbNames]),
                            ].sort((a, b) => a.localeCompare(b));
                            return (
                                <div
                                    key={profile.id || profile.name}
                                    className='rounded-md border border-(--border-panel)'
                                >
                                    <div className='group flex items-center gap-2.5 px-2.5 py-2'>
                                        <StatusDot entry={entry} />
                                        <img
                                            src={provider.icon}
                                            alt=''
                                            className='h-6 w-6 shrink-0 object-contain'
                                        />
                                        <div className='flex min-w-0 flex-1 flex-col'>
                                            <span className='truncate text-small font-medium text-foreground'>
                                                {profile.name}
                                            </span>
                                            {endpoint && (
                                                <span
                                                    className='truncate text-label text-muted-foreground/70'
                                                    title={endpoint}
                                                >
                                                    {endpoint}
                                                </span>
                                            )}
                                        </div>
                                        {provider.requiresHost && (
                                            <Button
                                                type='button'
                                                variant='ghost'
                                                size='icon'
                                                title='Databases'
                                                onClick={() => {
                                                    setExpandedId(
                                                        isExpanded ? null : profile.id || null,
                                                    );
                                                    setNewDbName('');
                                                }}
                                            >
                                                <Database size={12} />
                                            </Button>
                                        )}
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='icon'
                                            title='Edit connection'
                                            onClick={() => m.openEdit(profile)}
                                        >
                                            <Pencil size={12} />
                                        </Button>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='icon'
                                            tone='destructive'
                                            title='Delete connection'
                                            onClick={() => void m.requestDelete(profile)}
                                        >
                                            <Trash2 size={12} />
                                        </Button>
                                    </div>

                                    {isExpanded && provider.requiresHost && (
                                        <div className='border-t border-(--border-panel) px-2.5 py-2'>
                                            {entry.loading ? (
                                                <div className='text-label text-muted-foreground'>
                                                    Loading databases…
                                                </div>
                                            ) : entry.error && allDbNames.length === 0 ? (
                                                <div className='text-label text-destructive'>
                                                    {entry.error}
                                                </div>
                                            ) : allDbNames.length === 0 ? (
                                                <div className='text-label text-muted-foreground'>
                                                    No databases visible.
                                                </div>
                                            ) : (
                                                <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-x-4 gap-y-1'>
                                                    <div className='text-label font-medium uppercase tracking-wide text-muted-foreground/70'>
                                                        Database
                                                    </div>
                                                    <div className='text-label font-medium uppercase tracking-wide text-muted-foreground/70'>
                                                        Bound by
                                                    </div>
                                                    {allDbNames.map(db => {
                                                        const bindings = usage.filter(
                                                            u => u.database === db,
                                                        );
                                                        const onServer =
                                                            entry.databases.includes(db);
                                                        return (
                                                            <React.Fragment key={db}>
                                                                <div
                                                                    className='flex min-w-0 items-center gap-1.5'
                                                                    title={
                                                                        onServer
                                                                            ? undefined
                                                                            : 'Referenced by a project but not found on the server'
                                                                    }
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            'truncate text-small',
                                                                            onServer
                                                                                ? 'text-foreground'
                                                                                : 'text-destructive',
                                                                        )}
                                                                    >
                                                                        {db}
                                                                    </span>
                                                                    {!onServer && (
                                                                        <span className='shrink-0 text-label text-destructive/80'>
                                                                            not on server
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className='flex min-w-0 flex-wrap items-center gap-1'>
                                                                    {bindings.length === 0 ? (
                                                                        <span className='text-label text-muted-foreground/50'>
                                                                            —
                                                                        </span>
                                                                    ) : (
                                                                        bindings.map(b => {
                                                                            const boundProject =
                                                                                projectById.get(
                                                                                    b.project_id,
                                                                                );
                                                                            const projectName =
                                                                                boundProject?.name ||
                                                                                b.project_name;
                                                                            const projectColor =
                                                                                boundProject
                                                                                    ? resolveProjectColor(
                                                                                          boundProject,
                                                                                      )?.value
                                                                                    : undefined;
                                                                            return (
                                                                                <span
                                                                                    key={`${b.project_id}:${b.environment_key}`}
                                                                                    style={
                                                                                        projectColor
                                                                                            ? {
                                                                                                  backgroundColor:
                                                                                                      projectColor,
                                                                                              }
                                                                                            : undefined
                                                                                    }
                                                                                    className='inline-flex items-center gap-1.5 overflow-hidden rounded-sm bg-background text-label text-muted-foreground'
                                                                                    title={`${projectName} · ${b.environment_name || b.environment_key}`}
                                                                                >
                                                                                    <span className='truncate px-2 font-semibold text-white'>
                                                                                        {
                                                                                            projectName
                                                                                        }
                                                                                    </span>
                                                                                    <EnvironmentBadge
                                                                                        label={getEnvironmentShortLabel(
                                                                                            b.environment_key,
                                                                                        )}
                                                                                        title={
                                                                                            b.environment_name ||
                                                                                            b.environment_key
                                                                                        }
                                                                                        className='rounded-none px-1 text-[10px] font-medium normal-case tracking-normal'
                                                                                    />
                                                                                </span>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className='mt-3 flex items-center gap-2'>
                                                <Input
                                                    value={newDbName}
                                                    onChange={e => setNewDbName(e.target.value)}
                                                    placeholder='new_database_name'
                                                />
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant='outline'
                                                    disabled={!newDbName.trim() || m.creatingDb}
                                                    onClick={() => {
                                                        void m
                                                            .createDatabase(profile, newDbName)
                                                            .then(() => setNewDbName(''));
                                                    }}
                                                >
                                                    {m.creatingDb ? (
                                                        <Spinner size={11} />
                                                    ) : (
                                                        'Create'
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create / edit form */}
            <Dialog open={m.formOpen} onOpenChange={next => !next && m.closeForm()}>
                <DialogContent
                    size='md'
                    className='flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0'
                >
                    <DialogHeader className='shrink-0 px-4 py-3'>
                        <DialogTitle>
                            {m.editingProfile ? `Edit ${m.editingProfile.name}` : 'New connection'}
                        </DialogTitle>
                        <DialogDescription className='sr-only'>
                            Server gateway credentials — shared across every project that references
                            this connection.
                        </DialogDescription>
                    </DialogHeader>
                    <ConnectionEditorPanel
                        form={m.form}
                        onCancel={m.closeForm}
                        banner={
                            m.editingProfile ? (
                                <p className='shrink-0 px-4 pt-3 text-label text-warning'>
                                    Changing credentials here updates every project using this
                                    connection.
                                </p>
                            ) : undefined
                        }
                    />
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={m.deleteTarget !== null}
                title='Delete connection'
                description={
                    <>
                        Delete <span className='font-semibold'>{m.deleteTarget?.name}</span> from
                        the connection pool?
                    </>
                }
                helperText={
                    m.deleteUsage.length > 0 ? (
                        <>
                            Used by {m.deleteUsage.length} environment
                            {m.deleteUsage.length === 1 ? '' : 's'} across{' '}
                            {new Set(m.deleteUsage.map(u => u.project_id)).size} project
                            {new Set(m.deleteUsage.map(u => u.project_id)).size === 1 ? '' : 's'}.
                            Those environments will need rebinding.
                        </>
                    ) : (
                        'Not referenced by any project environment.'
                    )
                }
                confirmLabel='Delete'
                destructive
                confirming={m.deleting}
                onCancel={m.cancelDelete}
                onConfirm={() => void m.confirmDelete()}
            />

            <ToolImportSheet
                open={m.importOpen}
                importers={m.availableImporters}
                selectedImporterKey={m.selectedImporterKey}
                connections={m.importConnections}
                onSelectImporter={m.selectImporter}
                onConfirm={m.confirmImport}
                onClose={m.closeImport}
            />

            <ToolExportSheet
                open={m.exportOpen}
                connections={m.connections}
                exporting={m.exporting}
                onConfirm={m.exportSelected}
                onClose={m.closeExport}
            />
        </div>
    );
};
