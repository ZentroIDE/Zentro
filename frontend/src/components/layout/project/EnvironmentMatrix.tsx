// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Plus, Settings2, X } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { ENVIRONMENT_KEYS, getEnvironmentMeta } from '../../../lib/projects';
import { getProvider } from '../../../lib/providers';
import {
    interactiveSelected,
    interactiveSurface,
    interactiveGhostDestructive,
} from '../../ui/contract';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    Input,
} from '../../ui';
import { EnvironmentBadge } from '../../shared/EnvironmentBadge';
import { useConnectionDatabases } from './useConnectionDatabases';
import type { EnvironmentKey } from '../../../types/project';
import type { ConnectionProfile } from '../../../types/connection';

export interface EnvironmentBinding {
    /** Pool connection ID this environment is bound to
     * (ProjectEnvironment.connection_ref). The matrix resolves the display
     * name / host from `connections`. */
    connectionRef: string;
    database: string;
}

interface ConnectionProbe {
    loading: boolean;
    error: string | null;
    databases: string[];
}

/** Tiny reachability LED for a connection: amber (probing) → red
 * (unreachable) → green (databases came back) → grey (not probed yet). The
 * database rows under a connection all share its status. */
const ConnectionStatusDot: React.FC<{ entry: ConnectionProbe; className?: string }> = ({
    entry,
    className,
}) => {
    const { tone, label } = entry.loading
        ? { tone: 'bg-warning animate-pulse', label: 'Checking connection…' }
        : entry.error
          ? { tone: 'bg-destructive', label: `Unreachable — ${entry.error}` }
          : entry.databases.length > 0
            ? { tone: 'bg-success', label: 'Connected' }
            : { tone: 'bg-muted-foreground/40', label: 'Not checked yet' };
    return (
        <span
            aria-label={label}
            title={label}
            className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', tone, className)}
        />
    );
};

interface EnvironmentMatrixProps {
    connections: ConnectionProfile[];
    getBinding: (envKey: EnvironmentKey) => EnvironmentBinding | null;
    onOpenEnv: (envKey: EnvironmentKey) => void;
    onBind: (envKey: EnvironmentKey, profile: ConnectionProfile, database: string) => void;
    onUnbind: (envKey: EnvironmentKey) => void;
    /** Opens Settings → Connections, where existing connections are edited,
     * deleted, imported and exported. */
    onManageConnections: () => void;
    /** Create a new connection without leaving the dialog. Edit/delete/import
     * still live in Settings via {@link onManageConnections}. */
    onCreateConnection?: () => void;
}

/**
 * Fixed 3-row Development/Staging/Production matrix — Zentro only supports
 * these three environments, so there's no "+ Add environment" affordance.
 * Clicking a row opens a modal picker dialog headed by the environment it
 * acts on; pick a database under a connection and both the connection and
 * database bind in one step. The picker can also add a new connection inline;
 * editing/deleting/importing/exporting them stays in Settings → Connections.
 */
export const EnvironmentMatrix: React.FC<EnvironmentMatrixProps> = ({
    connections,
    getBinding,
    onOpenEnv,
    onBind,
    onUnbind,
    onManageConnections,
    onCreateConnection,
}) => {
    const [openEnvKey, setOpenEnvKey] = React.useState<EnvironmentKey | null>(null);
    const [query, setQuery] = React.useState('');
    const { getEntry, loadAll } = useConnectionDatabases();

    React.useEffect(() => {
        loadAll(connections);
    }, [connections, loadAll]);

    const handleOpenChange = (envKey: EnvironmentKey, open: boolean) => {
        if (open) {
            setQuery('');
            setOpenEnvKey(envKey);
            onOpenEnv(envKey);
        } else if (openEnvKey === envKey) {
            setOpenEnvKey(null);
        }
    };

    const keyword = query.trim().toLowerCase();

    return (
        <div className='grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1.5'>
            {ENVIRONMENT_KEYS.map(envKey => {
                const meta = getEnvironmentMeta(envKey);
                const binding = getBinding(envKey);
                const boundProfile = binding
                    ? (connections.find(c => c.id === binding.connectionRef) ?? null)
                    : null;
                const boundProvider = boundProfile ? getProvider(boundProfile.driver || '') : null;
                const boundLabel = boundProfile?.name || binding?.connectionRef || '';
                const boundHost = boundProfile?.host
                    ? `${boundProfile.host}${boundProfile.port ? `:${boundProfile.port}` : ''}`
                    : '';
                const bindingMissing = Boolean(binding && !boundProfile);
                const isOpen = openEnvKey === envKey;

                return (
                    <React.Fragment key={envKey}>
                        <div className='justify-self-end'>
                            <EnvironmentBadge label={meta.label} toneClassName={meta.colorClass} />
                        </div>
                        <div className='min-w-0 py-0.5'>
                            <Dialog
                                open={isOpen}
                                onOpenChange={(open: boolean) => handleOpenChange(envKey, open)}
                            >
                                <DialogTrigger asChild>
                                    {binding ? (
                                        <div
                                            role='button'
                                            tabIndex={0}
                                            className={cn(
                                                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left cursor-pointer',
                                                interactiveSurface,
                                            )}
                                        >
                                            {boundProvider && (
                                                <img
                                                    src={boundProvider.icon}
                                                    alt={boundProvider.label}
                                                    className='h-8 w-8 shrink-0 object-contain'
                                                />
                                            )}
                                            <div className='flex min-w-0 flex-1 flex-col'>
                                                <span className='truncate text-small font-semibold text-foreground'>
                                                    {boundLabel}
                                                    <span className='mx-1 font-normal text-muted-foreground/60'>
                                                        /
                                                    </span>
                                                    <span className='font-normal'>
                                                        {binding.database}
                                                    </span>
                                                </span>
                                                {bindingMissing ? (
                                                    <span className='truncate text-label font-normal text-destructive'>
                                                        Connection no longer in the pool — pick
                                                        another, or add it back in Settings
                                                    </span>
                                                ) : (
                                                    boundHost && (
                                                        <span
                                                            className='truncate text-label font-normal text-muted-foreground/70'
                                                            title={boundHost}
                                                        >
                                                            {boundHost}
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                            <Button
                                                type='button'
                                                variant='ghost'
                                                size='micro'
                                                title='Unbind'
                                                className={cn(
                                                    'shrink-0 opacity-0 transition-opacity group-hover:opacity-100',
                                                    interactiveGhostDestructive,
                                                )}
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    onUnbind(envKey);
                                                }}
                                            >
                                                <X size={11} />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            type='button'
                                            variant='outline'
                                            className='h-auto w-full justify-start gap-1.5 border-dashed px-2.5 py-1.5 text-label text-muted-foreground'
                                        >
                                            <Plus size={12} />
                                            Bind connection &amp; database
                                        </Button>
                                    )}
                                </DialogTrigger>

                                <DialogContent
                                    data-testid='env-binding-picker'
                                    size='sm'
                                    showCloseButton={false}
                                    className='z-topmost flex max-h-[75vh] w-120 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0'
                                >
                                    {/* Which environment this picker is acting on. */}
                                    <div className='flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2'>
                                        <EnvironmentBadge
                                            label={meta.label}
                                            toneClassName={meta.colorClass}
                                        />
                                        <DialogTitle className='truncate text-label font-normal text-muted-foreground'>
                                            {binding
                                                ? 'Change connection & database'
                                                : 'Bind connection & database'}
                                        </DialogTitle>
                                        <DialogDescription className='sr-only'>
                                            Pick a database under a connection to bind it to the{' '}
                                            {meta.label} environment.
                                        </DialogDescription>
                                    </div>

                                    {/* Fixed filter cluster */}
                                    <div className='flex shrink-0 items-center gap-2 p-2'>
                                        <Input
                                            autoFocus
                                            variant='ghost'
                                            size='micro'
                                            value={query}
                                            onChange={event => setQuery(event.target.value)}
                                            placeholder='Filter connection or database…'
                                            className='h-7'
                                        />
                                    </div>

                                    <div className='min-h-0 flex-1 overflow-y-auto pt-0 p-1.5'>
                                        {connections.length === 0 ? (
                                            <div className='flex flex-col items-center gap-2 px-2 py-6 text-center text-label text-muted-foreground'>
                                                {onCreateConnection ? (
                                                    <>
                                                        <span>
                                                            No connections yet — add one to bind an
                                                            environment.
                                                        </span>
                                                        <Button
                                                            type='button'
                                                            variant='default'
                                                            size='sm'
                                                            className='gap-1.5'
                                                            onClick={() => {
                                                                setOpenEnvKey(null);
                                                                onCreateConnection();
                                                            }}
                                                        >
                                                            <Plus size={13} />
                                                            New connection
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <span>
                                                        No connections yet. Add one in Settings,
                                                        then bind it here.
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            connections.map(profile => {
                                                if (!profile.name) return null;
                                                const provider = getProvider(profile.driver);
                                                const entry = getEntry(profile.name);
                                                const databases = entry.databases;
                                                const visibleDatabases = keyword
                                                    ? databases.filter(
                                                          db =>
                                                              db.toLowerCase().includes(keyword) ||
                                                              profile.name
                                                                  .toLowerCase()
                                                                  .includes(keyword),
                                                      )
                                                    : databases;

                                                // Keep an errored connection visible even while
                                                // filtering — its failure is worth surfacing.
                                                if (
                                                    keyword &&
                                                    !entry.error &&
                                                    visibleDatabases.length === 0
                                                )
                                                    return null;

                                                return (
                                                    <div key={profile.name} className='mb-1'>
                                                        <div className='sticky top-0 z-10 flex items-center gap-1.5 px-2 py-1 bg-background'>
                                                            <ConnectionStatusDot entry={entry} />
                                                            <img
                                                                src={provider.icon}
                                                                alt=''
                                                                className='h-6 w-6 shrink-0 object-contain'
                                                            />
                                                            <span className='truncate'>
                                                                {profile.name}
                                                                {profile.host
                                                                    ? ` · ${
                                                                          profile.username
                                                                              ? `${profile.username}@`
                                                                              : ''
                                                                      }${profile.host}${
                                                                          profile.port
                                                                              ? `:${profile.port}`
                                                                              : ''
                                                                      }`
                                                                    : ''}
                                                            </span>
                                                        </div>
                                                        {entry.loading ? (
                                                            <div className='px-2 py-1.5 text-label text-muted-foreground'>
                                                                Loading databases…
                                                            </div>
                                                        ) : entry.error ? (
                                                            <div className='px-2 py-1.5 text-label text-destructive'>
                                                                {entry.error}
                                                            </div>
                                                        ) : visibleDatabases.length === 0 ? (
                                                            <div className='px-2 py-1.5 text-label text-muted-foreground'>
                                                                No databases found
                                                            </div>
                                                        ) : (
                                                            visibleDatabases.map(dbName => {
                                                                const selected =
                                                                    binding?.connectionRef ===
                                                                        profile.id &&
                                                                    binding?.database === dbName;
                                                                return (
                                                                    <Button
                                                                        key={dbName}
                                                                        type='button'
                                                                        variant='ghost'
                                                                        className={cn(
                                                                            'pl-5 border-none! h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-small transition-colors',
                                                                            selected
                                                                                ? interactiveSelected
                                                                                : interactiveSurface,
                                                                        )}
                                                                        onClick={() => {
                                                                            setOpenEnvKey(null);
                                                                            onBind(
                                                                                envKey,
                                                                                profile,
                                                                                dbName,
                                                                            );
                                                                        }}
                                                                    >
                                                                        {dbName}
                                                                    </Button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Footer — manage existing connections in Settings
                                        (left), or add a new one inline (right). */}
                                    <div className='flex items-center justify-between border-t border-border p-2'>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='sm'
                                            className='gap-1.5 rounded-sm'
                                            onClick={() => {
                                                setOpenEnvKey(null);
                                                onManageConnections();
                                            }}
                                        >
                                            <Settings2 size={13} />
                                            Manage connections
                                        </Button>
                                        {onCreateConnection && (
                                            <Button
                                                type='button'
                                                variant='default'
                                                size='sm'
                                                className='gap-1.5 rounded-sm'
                                                onClick={() => {
                                                    setOpenEnvKey(null);
                                                    onCreateConnection();
                                                }}
                                            >
                                                <Plus size={13} />
                                                New connection
                                            </Button>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};
