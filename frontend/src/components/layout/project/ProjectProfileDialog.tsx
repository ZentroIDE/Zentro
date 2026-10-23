// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/cn';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Spinner,
} from '../../ui';
import { ConnectionFormPanel } from '../../connection';
import { interactiveSelected } from '../../ui/contract';
import { PROJECT_ICON_MAP, PROJECT_ICON_OPTIONS } from '../projectHubMeta';
import { PROJECT_COLOR_PALETTE, resolveProjectColor } from '../../../lib/projectColors';
import { ProjectColorPicker } from './ProjectColorPicker';
import { WizardStorageField } from './WizardStorageField';
import { EnvironmentMatrix } from './EnvironmentMatrix';
import { useProjectSetupTour } from '../../../features/onboarding/useProjectSetupTour';
import type { WizardDraftData, DraftEnvironmentBinding } from './ProjectWizard.types';
import type { EnvironmentKey, Project } from '../../../types/project';
import type { ConnectionProfile } from '../../../types/connection';

interface ConnectionPanelState {
    /** Close the project dialog and open Settings → Connections (edit,
     * delete, import, export). */
    onManageConnections: () => void;
}

interface ProjectProfileDialogProps {
    mode: 'create' | 'edit';
    draft: WizardDraftData;
    /** Set in edit mode so the Auto swatch can preview the hash-derived color. */
    editingProjectId?: string;
    /** The live project being edited — the environment matrix reads bindings
     * straight from it in edit mode (there's no optimistic display layer). */
    editProject?: Project | null;
    onDraftChange: (d: WizardDraftData) => void;
    storageParentPath: string;
    storagePath: string;
    storagePathPreview: string;
    loadingStorageRoot: boolean;
    pathConflictProject: Project | null;
    onStorageChange: (value: string) => void;
    onPickFolder: () => void | Promise<void>;
    connections: ConnectionProfile[];
    onSetActiveEnvKey: (key: EnvironmentKey) => void;
    draftEnvironmentBindings: Partial<Record<EnvironmentKey, DraftEnvironmentBinding>>;
    onBind: (k: EnvironmentKey, profile: ConnectionProfile, database: string) => void;
    onUnbind: (k: EnvironmentKey) => void;
    connectionPanel: ConnectionPanelState;
    submitting: boolean;
    /** First-run flow: no Toolbar behind the dialog, so let the backdrop drag the window. */
    /** Called after a connection is created from inside this dialog, so the
     * wizard can reload the pool the matrix picks from. */
    onConnectionCreated?: () => void;
    onCancel: () => void;
    onSubmit: () => void | Promise<void>;
}

/**
 * Same Dialog for create and edit: project identity + storage on top, the
 * fixed 3-row Environment Matrix below. The matrix picks a (connection,
 * database) pair from the pool and can add a new connection inline; existing
 * connections are edited/deleted in Settings → Connections.
 */
export const ProjectProfileDialog: React.FC<ProjectProfileDialogProps> = ({
    mode,
    draft,
    editingProjectId,
    editProject,
    onDraftChange,
    storageParentPath,
    storagePath,
    storagePathPreview,
    loadingStorageRoot,
    pathConflictProject,
    onStorageChange,
    onPickFolder,
    connections,
    onSetActiveEnvKey,
    draftEnvironmentBindings,
    onBind,
    onUnbind,
    connectionPanel,
    submitting,
    onConnectionCreated,
    onCancel,
    onSubmit,
}) => {
    const isEditMode = mode === 'edit';

    // Swaps the dialog body for the connection form; the draft lives in the
    // parent, so nothing typed on the project view is lost.
    const [showConnectionForm, setShowConnectionForm] = React.useState(false);

    useProjectSetupTour({ enabled: mode === 'create' && !showConnectionForm });

    const getBinding = React.useCallback(
        (envKey: EnvironmentKey) => {
            if (!isEditMode) {
                const binding = draftEnvironmentBindings[envKey];
                const connectionRef = binding?.profile?.id;
                return connectionRef && binding?.database
                    ? { connectionRef, database: binding.database }
                    : null;
            }
            const environment = editProject?.environments?.find(e => e.key === envKey);
            return environment?.connection_ref && environment.last_database
                ? {
                      connectionRef: environment.connection_ref,
                      database: environment.last_database,
                  }
                : null;
        },
        [draftEnvironmentBindings, editProject, isEditMode],
    );

    const IconComponent = PROJECT_ICON_MAP[draft.iconKey]?.icon ?? PROJECT_ICON_MAP.general.icon;
    const iconColor = draft.colorKey
        ? PROJECT_COLOR_PALETTE.find(option => option.key === draft.colorKey)?.value
        : editingProjectId
          ? resolveProjectColor({ id: editingProjectId })?.value
          : undefined;

    return (
        <Dialog open onOpenChange={next => !next && onCancel()}>
            <DialogContent
                size='lg'
                className='flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-184 flex-col gap-0 overflow-hidden rounded-md p-0'
            >
                <DialogHeader className='flex shrink-0 flex-row items-center gap-2 bg-background px-6 py-3 text-left'>
                    {showConnectionForm && (
                        <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            title='Back to project'
                            onClick={() => setShowConnectionForm(false)}
                            className='-ml-2 shrink-0'
                        >
                            <ChevronLeft size={16} />
                        </Button>
                    )}
                    <div className='min-w-0 flex-1'>
                        <DialogTitle>
                            {showConnectionForm
                                ? 'Add a connection'
                                : isEditMode
                                  ? 'Edit Project'
                                  : 'New Project'}
                        </DialogTitle>
                        <DialogDescription className='sr-only'>
                            {showConnectionForm
                                ? 'Server gateway credentials for the new connection.'
                                : 'Project name, description, storage location, and environment bindings.'}
                        </DialogDescription>
                    </div>
                </DialogHeader>

                {showConnectionForm ? (
                    <div className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background'>
                        <ConnectionFormPanel
                            existingNames={connections
                                .map(c => c.name)
                                .filter((name): name is string => Boolean(name))}
                            onSaved={() => {
                                onConnectionCreated?.();
                                setShowConnectionForm(false);
                            }}
                            onCancel={() => setShowConnectionForm(false)}
                        />
                    </div>
                ) : (
                    <>
                        <div className='min-h-0 flex-1 overflow-y-auto bg-background px-6 py-4'>
                            <div className='mx-auto flex w-full max-w-xl flex-col gap-3'>
                                <div
                                    className='flex items-center gap-3'
                                    data-tour='project-icon-color'
                                >
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                type='button'
                                                variant='ghost'
                                                className={cn(
                                                    'h-10 w-10 shrink-0 rounded-md p-0',
                                                    iconColor
                                                        ? 'text-white!'
                                                        : 'text-foreground/70',
                                                )}
                                                style={
                                                    iconColor
                                                        ? { backgroundColor: iconColor }
                                                        : undefined
                                                }
                                                title='Change project icon'
                                            >
                                                <IconComponent size={32} />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            align='start'
                                            className='z-topmost w-64 p-1.5'
                                        >
                                            <div className='grid grid-cols-2 gap-1'>
                                                {PROJECT_ICON_OPTIONS.map(option => {
                                                    const OptionIcon = option.icon;
                                                    const active = draft.iconKey === option.key;
                                                    return (
                                                        <Button
                                                            key={option.key}
                                                            type='button'
                                                            variant='ghost'
                                                            className={cn(
                                                                'h-auto justify-start gap-2 px-2 py-1.5 text-label border-none!',
                                                                active && interactiveSelected,
                                                            )}
                                                            onClick={() =>
                                                                onDraftChange({
                                                                    ...draft,
                                                                    iconKey: option.key,
                                                                })
                                                            }
                                                        >
                                                            <OptionIcon size={13} />
                                                            <span className='truncate'>
                                                                {option.label}
                                                            </span>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            <div className=''>
                                                <span className='text-label text-muted-foreground'>
                                                    Color
                                                </span>
                                                <ProjectColorPicker
                                                    value={draft.colorKey}
                                                    onSelect={colorKey =>
                                                        onDraftChange({ ...draft, colorKey })
                                                    }
                                                />
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className='flex flex-col gap-3' data-tour='project-info'>
                                    <label className='text-label uppercase text-muted-foreground'>
                                        Project Info
                                    </label>
                                    <div className='flex flex-col gap-2'>
                                        <div className='flex flex-col gap-1'>
                                            <label className='text-label font-medium text-foreground'>
                                                Project name
                                                <span className='text-destructive'> *</span>
                                            </label>
                                            <Input
                                                value={draft.name}
                                                onChange={event =>
                                                    onDraftChange({
                                                        ...draft,
                                                        name: event.target.value,
                                                    })
                                                }
                                                placeholder='My Project'
                                                className=' bg-background!'
                                                autoFocus
                                            />
                                        </div>
                                        <div className='flex flex-col gap-1'>
                                            <label className='text-label font-medium text-foreground'>
                                                Description
                                            </label>
                                            <Input
                                                value={draft.description}
                                                onChange={event =>
                                                    onDraftChange({
                                                        ...draft,
                                                        description: event.target.value,
                                                    })
                                                }
                                                placeholder='Optional description'
                                                className='resize-none text-label bg-background!'
                                            />
                                        </div>
                                        <div className='flex flex-col gap-1'>
                                            <label className='text-label font-medium text-foreground'>
                                                Location
                                            </label>
                                            <WizardStorageField
                                                mode={mode}
                                                storageParentPath={storageParentPath}
                                                storagePath={storagePath}
                                                storagePathPreview={storagePathPreview}
                                                loadingRoot={loadingStorageRoot}
                                                pathConflictProject={pathConflictProject}
                                                onChange={onStorageChange}
                                                onPickFolder={onPickFolder}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <label className='text-label uppercase text-muted-foreground'>
                                    Environment Bindings
                                </label>
                                <div
                                    className='overflow-hidden rounded-md py-2'
                                    data-tour='project-env-bindings'
                                >
                                    <EnvironmentMatrix
                                        connections={connections}
                                        getBinding={getBinding}
                                        onOpenEnv={onSetActiveEnvKey}
                                        onBind={onBind}
                                        onUnbind={onUnbind}
                                        onManageConnections={connectionPanel.onManageConnections}
                                        onCreateConnection={() => setShowConnectionForm(true)}
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className='shrink-0 bg-background px-6 py-3'>
                            <Button
                                type='button'
                                variant='ghost'
                                onClick={onCancel}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type='button'
                                variant='default'
                                onClick={() => void onSubmit()}
                                disabled={submitting || !draft.name.trim()}
                                className='gap-1.5'
                            >
                                {submitting && <Spinner size={12} />}
                                {isEditMode ? 'Save Changes' : 'Create Project'}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
