// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, FolderOpen, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';

import { useProjectStore } from '../../../stores/projectStore';
import { useOpenProject } from '../../../hooks/useOpenProject';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { DOM_EVENT } from '../../../lib/constants';
import { ProjectHubSurface, ProjectWizardMode } from '../../../lib/enums';
import { emitCommand, onCommand } from '../../../lib/commandBus';
import { resolveProjectColor } from '../../../lib/projectColors';
import type { Project } from '../../../types/project';
import {
    Button,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '../../ui';
import { ProjectRowContent } from '../project/ProjectRowContent';
import { useToast } from '../Toast';
import {
    ProjectServiceError,
    openProjectInNewWindow,
    persistProject,
} from '../../../services/project';
import {
    PROJECT_ICON_MAP,
    PROJECT_ICON_OPTIONS,
    buildTagsWithProjectIcon,
    buildTagsWithProjectPinned,
    getProjectIconKey,
    isProjectPinned,
    sortProjects,
    type ProjectIconKey,
} from '../projectHubMeta';
import { interactiveSelected, interactiveSurface } from '../../ui/contract';
import { cn } from '../../../lib/cn';

const QUICK_PROJECT_CLOSE_DELAY_MS = 120;

/**
 * QuickProjectPopover renders the project-switch trigger badge and its hover
 * popover — the project-zone counterpart to QuickEnvPopover. On hover it
 * lists every project (pinned first, then most recently opened, via
 * `sortProjects` — same ordering as the full Project Hub); selecting one
 * opens it through the shared `useOpenProject` flow. Click still opens the
 * full Project Hub, same as before this component existed.
 */
export const QuickProjectPopover: React.FC = () => {
    const projects = useProjectStore(s => s.projects);
    const activeProject = useProjectStore(s => s.activeProject);
    const patchProject = useProjectStore(s => s.patchProject);
    const deleteProject = useProjectStore(s => s.deleteProject);
    const { openProject } = useOpenProject();
    const { toast } = useToast();

    const [quickOpen, setQuickOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [contextMenuProjectId, setContextMenuProjectId] = useState<string | null>(null);
    const [iconUpdatingProjectId, setIconUpdatingProjectId] = useState<string | null>(null);
    const [pinUpdatingProjectId, setPinUpdatingProjectId] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const popoverContentRef = useRef<HTMLDivElement>(null);

    const clearCloseTimer = useCallback(() => {
        if (closeTimerRef.current === null) return;
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }, []);

    const openQuick = useCallback(() => {
        clearCloseTimer();
        setQuickOpen(true);
    }, [clearCloseTimer]);

    // While a row's context menu (or the delete confirm dialog) is open the
    // pointer is legitimately outside the popover — don't let the hover-out
    // timer tear the list down under it.
    const suppressCloseRef = useRef(false);
    suppressCloseRef.current = contextMenuProjectId !== null || projectToDelete !== null;

    const scheduleClose = useCallback(() => {
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            if (suppressCloseRef.current) return;
            setQuickOpen(false);
        }, QUICK_PROJECT_CLOSE_DELAY_MS);
    }, [clearCloseTimer]);

    useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);
    useEffect(() => {
        if (!quickOpen) setQuery('');
    }, [quickOpen]);

    // Ctrl+P (connection.openProjectSwitcher) toggles this popover open the
    // same way hovering the trigger does, for keyboard-only quick switch.
    useEffect(
        () =>
            onCommand(DOM_EVENT.QUICK_SWITCH_PROJECT, () => {
                setQuickOpen(current => {
                    if (current) return false;
                    clearCloseTimer();
                    return true;
                });
            }),
        [clearCloseTimer],
    );

    const orderedProjects = useMemo(() => sortProjects(projects || []), [projects]);
    const visibleProjects = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return orderedProjects;
        return orderedProjects.filter(project =>
            [project.name, project.description || ''].join(' ').toLowerCase().includes(keyword),
        );
    }, [orderedProjects, query]);

    // Opening the popover highlights the current project (if visible) rather
    // than always starting at the top of the list.
    useEffect(() => {
        if (!quickOpen) return;
        const activeIndex = orderedProjects.findIndex(project => project.id === activeProject?.id);
        setHighlightedIndex(activeIndex >= 0 ? activeIndex : 0);
        // Only react to the popover opening, not to every list change while it's open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickOpen]);

    // Typing narrows the list — re-anchor the highlight to the top match.
    useEffect(() => {
        setHighlightedIndex(0);
    }, [visibleProjects]);

    useEffect(() => {
        rowRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [highlightedIndex]);

    useEffect(() => {
        if (quickOpen) searchInputRef.current?.focus();
    }, [quickOpen]);

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (visibleProjects.length === 0) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightedIndex(current => (current + 1) % visibleProjects.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex(
                current => (current - 1 + visibleProjects.length) % visibleProjects.length,
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const target = visibleProjects[highlightedIndex];
            if (target) void handleSwitchProject(target);
        } else if (event.key === 'Escape') {
            setQuickOpen(false);
        }
    };

    const activeProjectIconKey = getProjectIconKey(activeProject);
    const ActiveProjectIcon = PROJECT_ICON_MAP[activeProjectIconKey].icon;
    const projectColorOption = resolveProjectColor(activeProject);

    const handleSwitchProject = async (project: Project) => {
        if (project.id === activeProject?.id) {
            setQuickOpen(false);
            return;
        }
        setQuickOpen(false);
        setSwitchingProjectId(project.id);
        await openProject(project.id);
        setSwitchingProjectId(null);
    };

    // ── Context-menu actions (mirrors the Project Hub list; the full
    // create/edit flow in Project Hub is slated for removal, so these live
    // here now). ────────────────────────────────────────────────────────────

    const handleOpenInNewWindow = async (project: Project) => {
        setQuickOpen(false);
        try {
            await openProjectInNewWindow(project.id);
        } catch (error) {
            toast.error(
                error instanceof ProjectServiceError
                    ? error.message
                    : `Could not open a new window: ${error}`,
            );
        }
    };

    const handleToggleProjectPin = async (project: Project) => {
        const currentlyPinned = isProjectPinned(project);
        const optimistic: Project = {
            ...project,
            tags: buildTagsWithProjectPinned(project.tags, !currentlyPinned),
        };
        patchProject(optimistic);
        setPinUpdatingProjectId(project.id);
        try {
            const updated = await persistProject(optimistic);
            if (updated) {
                patchProject(updated);
            } else {
                patchProject(project);
                toast.error(`Could not ${currentlyPinned ? 'unpin' : 'pin'} project.`);
            }
        } catch (error) {
            patchProject(project);
            toast.error(`Could not ${currentlyPinned ? 'unpin' : 'pin'} project: ${error}`);
        } finally {
            setPinUpdatingProjectId(null);
        }
    };

    const handleSelectProjectIcon = async (project: Project, iconKey: ProjectIconKey) => {
        if (getProjectIconKey(project) === iconKey) return;
        const optimistic: Project = {
            ...project,
            tags: buildTagsWithProjectIcon(project.tags, iconKey),
        };
        patchProject(optimistic);
        setIconUpdatingProjectId(project.id);
        try {
            const updated = await persistProject(optimistic);
            if (updated) {
                patchProject(updated);
            } else {
                patchProject(project);
                toast.error('Could not update project icon.');
            }
        } catch (error) {
            patchProject(project);
            toast.error(`Could not update project icon: ${error}`);
        } finally {
            setIconUpdatingProjectId(null);
        }
    };

    const handleStartEdit = (project: Project) => {
        setQuickOpen(false);
        emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
            surface: ProjectHubSurface.WIZARD,
            wizardMode: ProjectWizardMode.EDIT,
            projectId: project.id,
        });
    };

    const handleOpenInFileExplorer = async (project: Project) => {
        const targetPath = (project.storage_path || '').trim();
        if (!targetPath) {
            toast.error('Project does not have a folder path yet.');
            return;
        }
        try {
            unwrapOrThrow(await getApiGateway().project.openDirectoryInExplorer(targetPath));
        } catch (error) {
            toast.error(`Could not open project folder: ${error}`);
        }
    };

    const handleConfirmDelete = async () => {
        if (!projectToDelete) return;
        setDeletingProjectId(projectToDelete.id);
        try {
            const deleted = await deleteProject(projectToDelete.id);
            if (!deleted) {
                toast.error('Could not delete project.');
                return;
            }
            toast.success('Project deleted permanently.');
        } catch (error) {
            toast.error(`Could not delete project: ${error}`);
        } finally {
            setDeletingProjectId(null);
            setProjectToDelete(null);
        }
    };

    return (
        <>
            <Popover open={quickOpen} onOpenChange={setQuickOpen}>
                <PopoverAnchor asChild>
                    <Button
                        type='button'
                        variant='ghost'
                        className={cn(
                            'flex-1 min-w-0 h-7 flex items-center text-white! gap-1.5 px-2 rounded-md transition-colors',
                            !activeProject && 'opacity-60',
                        )}
                        title='Open Project Hub. Hover to quick switch.'
                        onMouseEnter={openQuick}
                        onMouseLeave={scheduleClose}
                        onFocus={openQuick}
                        onBlur={event => {
                            // Focus moving into the popover itself (e.g. the
                            // auto-focused search input) isn't a dismissal.
                            if (
                                event.relatedTarget instanceof Node &&
                                popoverContentRef.current?.contains(event.relatedTarget)
                            ) {
                                return;
                            }
                            scheduleClose();
                        }}
                        onClick={() => {
                            setQuickOpen(false);
                            emitCommand(DOM_EVENT.OPEN_PROJECT_HUB);
                        }}
                    >
                        <ActiveProjectIcon
                            size={14}
                            className={cn(
                                'shrink-0',
                                !projectColorOption && 'text-muted-foreground',
                            )}
                        />
                        <span
                            className={cn(
                                'truncate max-w-20 xl:max-w-32 font-medium',
                                !projectColorOption && 'text-foreground',
                            )}
                        >
                            {activeProject?.name || 'No Project'}
                        </span>
                    </Button>
                </PopoverAnchor>

                <PopoverContent
                    ref={popoverContentRef}
                    align='center'
                    side='bottom'
                    sideOffset={8}
                    className='z-dropdown w-90 max-w-xl rounded-md border-none p-0 shadow-elevation-md'
                    onMouseEnter={clearCloseTimer}
                    onMouseLeave={scheduleClose}
                >
                    <div className='flex flex-col gap-2 p-2'>
                        <div className='text-center font-semibold text-muted-foreground'>
                            Projects
                        </div>
                        <div className='flex items-center gap-2'>
                            <div className='min-w-0 basis-1/2 rounded-md bg-muted/30'>
                                <Input
                                    ref={searchInputRef}
                                    variant='ghost'
                                    size='micro'
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    placeholder='Search your project...'
                                    className='h-7'
                                />
                            </div>
                            <div className='flex min-w-0 basis-1/2 items-center gap-1'>
                                <Button
                                    type='button'
                                    variant='default'
                                    size='sm'
                                    className='min-w-0 flex-1'
                                    onClick={() => {
                                        setQuickOpen(false);
                                        emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                                            surface: ProjectHubSurface.WIZARD,
                                            wizardMode: ProjectWizardMode.CREATE,
                                        });
                                    }}
                                >
                                    <Plus size={13} />
                                    New
                                </Button>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='sm'
                                    className='min-w-0 flex-1'
                                    title='Open an existing Zentro project folder'
                                    onClick={() => {
                                        setQuickOpen(false);
                                        emitCommand(DOM_EVENT.OPEN_PROJECT_FOLDER);
                                    }}
                                >
                                    <FolderOpen size={13} />
                                    Open
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className='max-h-80 overflow-y-auto p-1.5 flex gap-1 flex-col'>
                        {visibleProjects.length === 0 ? (
                            <div className='px-2 py-4 text-center text-label text-muted-foreground'>
                                No matching project
                            </div>
                        ) : (
                            visibleProjects.map((project, index) => {
                                const iconKey = getProjectIconKey(project);
                                const pinned = isProjectPinned(project);
                                const isActive = project.id === activeProject?.id;
                                const isSwitching = switchingProjectId === project.id;
                                const isHighlighted = index === highlightedIndex;
                                const isUpdatingIcon = iconUpdatingProjectId === project.id;
                                const isUpdatingPin = pinUpdatingProjectId === project.id;
                                const isDeleting = deletingProjectId === project.id;
                                const isDisabled = isSwitching || isDeleting;
                                const isContextSelected = contextMenuProjectId === project.id;

                                return (
                                    // `modal` (Radix default) so the first
                                    // outside click only dismisses the menu —
                                    // it must not also fall through and switch
                                    // to whatever row was under the cursor.
                                    <ContextMenu
                                        key={project.id}
                                        onOpenChange={open =>
                                            setContextMenuProjectId(current => {
                                                if (open) return project.id;
                                                return current === project.id ? null : current;
                                            })
                                        }
                                    >
                                        <ContextMenuTrigger asChild disabled={isDisabled}>
                                            <div
                                                ref={el => {
                                                    rowRefs.current[index] = el;
                                                }}
                                                role='button'
                                                tabIndex={isDisabled ? -1 : 0}
                                                aria-disabled={isDisabled}
                                                aria-selected={isHighlighted}
                                                data-testid={`quick-switch-project-${project.id}`}
                                                className={cn(
                                                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                                                    isDisabled
                                                        ? 'cursor-default opacity-60'
                                                        : 'cursor-pointer',
                                                    isActive
                                                        ? interactiveSelected
                                                        : // `interactiveSurface` gives real mouse :hover the
                                                          // same wash the rest of the app uses; the keyboard
                                                          // highlight forces that identical background via the
                                                          // same token so both paths look the same. (Plain
                                                          // `bg-muted/*` reads as invisible here — `--muted` is
                                                          // already a low-opacity color-mix, so stacking a
                                                          // Tailwind opacity modifier on top nearly vanishes.)
                                                          cn(
                                                              interactiveSurface,
                                                              (isHighlighted ||
                                                                  isContextSelected) &&
                                                                  'bg-(--state-hover-bg)',
                                                          ),
                                                )}
                                                onMouseEnter={() => setHighlightedIndex(index)}
                                                onContextMenu={() => setHighlightedIndex(index)}
                                                onClick={() => {
                                                    if (!isDisabled)
                                                        void handleSwitchProject(project);
                                                }}
                                                onKeyDown={event => {
                                                    if (
                                                        event.key === 'Enter' ||
                                                        event.key === ' '
                                                    ) {
                                                        event.preventDefault();
                                                        if (!isDisabled)
                                                            void handleSwitchProject(project);
                                                    }
                                                }}
                                            >
                                                <ProjectRowContent
                                                    project={project}
                                                    isActive={isActive}
                                                    statusLabel={
                                                        isSwitching ? 'Opening...' : undefined
                                                    }
                                                />
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className='min-w-50'>
                                            <ContextMenuItem
                                                disabled={isDisabled}
                                                onSelect={() => void handleOpenInNewWindow(project)}
                                            >
                                                <AppWindow size={13} className='mr-1.5' />
                                                Open in new window
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                disabled={isDisabled || isUpdatingPin}
                                                onSelect={() =>
                                                    void handleToggleProjectPin(project)
                                                }
                                            >
                                                {pinned ? (
                                                    <PinOff size={13} className='mr-1.5' />
                                                ) : (
                                                    <Pin size={13} className='mr-1.5' />
                                                )}
                                                {pinned ? 'Unpin project' : 'Pin project'}
                                            </ContextMenuItem>
                                            <ContextMenuSub>
                                                <ContextMenuSubTrigger
                                                    disabled={isDisabled || isUpdatingIcon}
                                                >
                                                    Change icon
                                                </ContextMenuSubTrigger>
                                                <ContextMenuSubContent className='min-w-45'>
                                                    {PROJECT_ICON_OPTIONS.map(option => {
                                                        const OptionIcon = option.icon;
                                                        const selected = option.key === iconKey;
                                                        return (
                                                            <ContextMenuItem
                                                                key={option.key}
                                                                onSelect={() =>
                                                                    void handleSelectProjectIcon(
                                                                        project,
                                                                        option.key,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    selected
                                                                        ? interactiveSelected
                                                                        : '',
                                                                    'flex gap-2',
                                                                )}
                                                            >
                                                                <OptionIcon size={13} />
                                                                {option.label}
                                                            </ContextMenuItem>
                                                        );
                                                    })}
                                                </ContextMenuSubContent>
                                            </ContextMenuSub>
                                            <ContextMenuSeparator />
                                            <ContextMenuItem
                                                disabled={isDisabled}
                                                onSelect={() => handleStartEdit(project)}
                                            >
                                                <Pencil size={13} className='mr-1.5' />
                                                Edit project
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                disabled={isDisabled}
                                                onSelect={() =>
                                                    void handleOpenInFileExplorer(project)
                                                }
                                            >
                                                <FolderOpen size={13} className='mr-1.5' />
                                                Open in file explorer
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                disabled={isDisabled}
                                                danger
                                                onSelect={() => {
                                                    setQuickOpen(false);
                                                    setProjectToDelete(project);
                                                }}
                                                className='text-destructive focus:text-destructive'
                                            >
                                                <Trash2 size={13} className='mr-1.5' />
                                                Delete project
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                );
                            })
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog
                open={Boolean(projectToDelete)}
                onOpenChange={open => {
                    if (!open && !deletingProjectId) setProjectToDelete(null);
                }}
            >
                <DialogContent size='sm'>
                    <DialogHeader>
                        <DialogTitle>Delete Project</DialogTitle>
                    </DialogHeader>
                    <div className='px-4 py-3'>
                        <p className='text-small'>
                            Delete "{projectToDelete?.name || 'this project'}" permanently?
                        </p>
                        <p className='text-label text-muted-foreground mt-1'>
                            This will permanently delete the project and its local data folder.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant='ghost'
                            onClick={() => setProjectToDelete(null)}
                            disabled={Boolean(deletingProjectId)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => void handleConfirmDelete()}
                            disabled={Boolean(deletingProjectId)}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
