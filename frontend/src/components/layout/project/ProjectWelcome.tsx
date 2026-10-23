// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { FolderOpen, Plus } from 'lucide-react';

import appIcon from '../../../assets/images/appicon.png';
import { emitCommand } from '../../../lib/commandBus';
import { DOM_EVENT } from '../../../lib/constants';
import { ProjectHubSurface, ProjectWizardMode } from '../../../lib/enums';
import { useOpenProject } from '../../../hooks/useOpenProject';
import { useProjectStore } from '../../../stores/projectStore';
import { useShortcutStore } from '../../../stores/shortcutStore';
import { Button, KeyBinding } from '../../ui';
import { interactiveSurface } from '../../ui/contract';
import { cn } from '../../../lib/cn';
import { ProjectRowContent } from './ProjectRowContent';
import { StartTrialButton } from '../StartTrialButton';

const MAX_RECENT_SHOWN = 5;

/**
 * Main-area surface while no project is open. A workspace without a project has
 * nowhere to keep scripts, so the only actions offered are creating or opening a
 * project (the VS Code "Welcome" equivalent). Recent projects are listed so a
 * failed auto-open never strands the user.
 */
export const ProjectWelcome: React.FC = () => {
    const projects = useProjectStore(s => s.projects);
    const recentProjectIds = useProjectStore(s => s.recentProjectIds);
    const getBinding = useShortcutStore(s => s.getBinding);
    const { openProject } = useOpenProject();

    const recentProjects = React.useMemo(() => {
        const byId = new Map(projects.map(project => [project.id, project]));
        const ordered = recentProjectIds.flatMap(id => {
            const project = byId.get(id);
            return project ? [project] : [];
        });
        const rest = projects
            .filter(project => !recentProjectIds.includes(project.id))
            .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        return [...ordered, ...rest].slice(0, MAX_RECENT_SHOWN);
    }, [projects, recentProjectIds]);

    return (
        <div
            className='flex h-full w-full flex-col items-center justify-center gap-6 px-6'
            data-testid='project-welcome'
            data-tour='project-welcome'
        >
            <img
                src={appIcon}
                alt=''
                aria-hidden='true'
                className='pointer-events-none h-40 w-40 object-contain opacity-20 grayscale'
            />
            <div className='flex flex-col items-center gap-1 text-center'>
                <h1 className='text-lg font-semibold text-foreground'>Welcome to Zentro</h1>
                <p className='text-small text-muted-foreground'>
                    Create a project or open an existing one to start working.
                </p>
            </div>

            <div className='flex w-96 flex-col gap-1'>
                <Button
                    type='button'
                    variant='ghost'
                    className='flex h-auto items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-left'
                    onClick={() =>
                        emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                            surface: ProjectHubSurface.WIZARD,
                            wizardMode: ProjectWizardMode.CREATE,
                        })
                    }
                >
                    <span className='flex items-center gap-2 text-small'>
                        <Plus size={14} />
                        New Project
                    </span>
                    <KeyBinding binding={getBinding('connection.newProject')} />
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    className='flex h-auto items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-left'
                    onClick={() => emitCommand(DOM_EVENT.OPEN_PROJECT_FOLDER)}
                >
                    <span className='flex items-center gap-2 text-small'>
                        <FolderOpen size={14} />
                        Open Project Folder…
                    </span>
                    <KeyBinding binding={getBinding('connection.openProjectFolder')} />
                </Button>
            </div>

            <StartTrialButton variant='ghost' size='sm' className='text-muted-foreground' />

            {recentProjects.length > 0 && (
                <div className='flex w-96 flex-col gap-1'>
                    <div className='px-2.5 text-label uppercase text-muted-foreground'>Recent</div>
                    {recentProjects.map(project => (
                        <Button
                            key={project.id}
                            type='button'
                            variant='ghost'
                            data-testid={`welcome-project-${project.id}`}
                            className={cn(
                                'flex h-auto w-full items-center justify-start gap-2.5 rounded-md px-2 py-1.5 text-left font-normal',
                                interactiveSurface,
                            )}
                            onClick={() => void openProject(project.id)}
                        >
                            <ProjectRowContent project={project} />
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};
