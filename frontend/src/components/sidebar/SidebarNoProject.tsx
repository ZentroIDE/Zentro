// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { FolderOpen, Plus } from 'lucide-react';

import { emitCommand } from '../../lib/commandBus';
import { DOM_EVENT } from '../../lib/constants';
import { ProjectHubSurface, ProjectWizardMode } from '../../lib/enums';
import { Button } from '../ui';

/** Sidebar body while no project is open: every panel here is project-scoped. */
export const SidebarNoProject: React.FC = () => (
    <div className='flex h-full flex-col items-center justify-center gap-3 px-4 text-center'>
        <p className='text-small text-muted-foreground'>
            Create or open a project to browse connections, scripts and history.
        </p>
        <div className='flex flex-col gap-1'>
            <Button
                type='button'
                size='sm'
                onClick={() =>
                    emitCommand(DOM_EVENT.OPEN_PROJECT_HUB, {
                        surface: ProjectHubSurface.WIZARD,
                        wizardMode: ProjectWizardMode.CREATE,
                    })
                }
            >
                <Plus size={13} />
                New Project
            </Button>
            <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => emitCommand(DOM_EVENT.OPEN_PROJECT_FOLDER)}
            >
                <FolderOpen size={13} />
                Open Project Folder…
            </Button>
        </div>
    </div>
);
