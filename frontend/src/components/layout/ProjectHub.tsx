// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { UpgradeDialog } from './UpgradeDialog';
import { ProjectWizard } from './project/ProjectWizard';
import { Dialog, DialogContent, DialogTitle, Spinner } from '../ui';
import type { Project, EnvironmentKey } from '../../types/project';
import {
    ENVIRONMENT_KEY,
    ProjectHubLaunchContext,
    ProjectWizardMode,
    type ProjectHubLaunchIntent,
} from '../../lib/constants';

interface ProjectHubProps {
    overlay?: boolean;
    onClose?: () => void;
    launchIntent?: ProjectHubLaunchIntent;
}

interface WizardState {
    mode: ProjectWizardMode;
    projectId: string | null;
    initialEnvironmentKey: EnvironmentKey;
    launchContext: ProjectHubLaunchContext;
}

function resolveDefaultEnvironment(project?: Project | null): EnvironmentKey {
    return (project?.last_active_environment_key ||
        project?.default_environment_key ||
        ENVIRONMENT_KEY.DEVELOPMENT) as EnvironmentKey;
}

// ProjectHub always resolves straight into the create/edit dialog — edit the
// active project when there is one, create a new one otherwise. There is no
// project-browsing surface here anymore; switching between existing projects
// lives in the toolbar's QuickProjectPopover.
function resolveWizardState(
    launchIntent: ProjectHubLaunchIntent | undefined,
    activeProject: Project | null | undefined,
): WizardState {
    if (launchIntent) {
        const mode = launchIntent.wizardMode || ProjectWizardMode.CREATE;
        const targetProjectId =
            mode === ProjectWizardMode.EDIT
                ? launchIntent.projectId || activeProject?.id || null
                : null;
        return {
            mode,
            projectId: targetProjectId,
            launchContext: launchIntent.launchContext || ProjectHubLaunchContext.DEFAULT,
            initialEnvironmentKey: (launchIntent.initialEnvironmentKey ||
                resolveDefaultEnvironment(activeProject)) as EnvironmentKey,
        };
    }

    return activeProject
        ? {
              mode: ProjectWizardMode.EDIT,
              projectId: activeProject.id,
              launchContext: ProjectHubLaunchContext.DEFAULT,
              initialEnvironmentKey: resolveDefaultEnvironment(activeProject),
          }
        : {
              mode: ProjectWizardMode.CREATE,
              projectId: null,
              launchContext: ProjectHubLaunchContext.DEFAULT,
              initialEnvironmentKey: resolveDefaultEnvironment(activeProject),
          };
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
    overlay = false,
    onClose,
    launchIntent,
}) => {
    const { projects, isLoading, activeProject } = useProjectStore();
    const gate = useFeatureGate();

    const [wizardState, setWizardState] = React.useState<WizardState>(() =>
        resolveWizardState(launchIntent, activeProject),
    );
    const [showUpgradeDialog, setShowUpgradeDialog] = React.useState(
        Boolean(launchIntent?.showProjectLimitUpgrade),
    );

    React.useLayoutEffect(() => {
        setWizardState(resolveWizardState(launchIntent, activeProject));
    }, [activeProject, launchIntent]);

    React.useEffect(() => {
        if (launchIntent?.showProjectLimitUpgrade) setShowUpgradeDialog(true);
    }, [launchIntent]);

    const projectsById = React.useMemo(
        () => new Map(projects.map(project => [project.id, project])),
        [projects],
    );
    const wizardProject = wizardState.projectId
        ? projectsById.get(wizardState.projectId) ||
          (activeProject?.id === wizardState.projectId ? activeProject : null)
        : null;

    // Don't render the wizard until the edit project is resolved — avoids a
    // flash of the create-mode wizard while the store hydrates.
    const waitingForWizardProject =
        wizardState.mode === ProjectWizardMode.EDIT &&
        Boolean(wizardState.projectId) &&
        !wizardProject &&
        isLoading;
    const wizardProjectMissing =
        wizardState.mode === ProjectWizardMode.EDIT &&
        Boolean(wizardState.projectId) &&
        !wizardProject &&
        !isLoading;

    const resolvedProjectLimit = gate.projectLimit;
    const isPaidActive = gate.hasFullAccess;
    const atProjectCap =
        Number.isFinite(resolvedProjectLimit) &&
        projects.length >= resolvedProjectLimit &&
        !isPaidActive;
    const capReachedForCreate = wizardState.mode === ProjectWizardMode.CREATE && atProjectCap;

    const handleClose = React.useCallback(() => {
        onClose?.();
    }, [onClose]);

    if (showUpgradeDialog || capReachedForCreate) {
        return (
            <UpgradeDialog
                open
                onClose={() => {
                    setShowUpgradeDialog(false);
                    handleClose();
                }}
                source='project-limit'
                projectLimit={
                    Number.isFinite(resolvedProjectLimit) ? resolvedProjectLimit : undefined
                }
                upgradeUrl={gate.upgradeUrl}
            />
        );
    }

    if (waitingForWizardProject || wizardProjectMissing) {
        return (
            <Dialog open onOpenChange={v => !v && handleClose()}>
                <DialogContent size='sm'>
                    <DialogTitle className='sr-only'>Project</DialogTitle>
                    <div className='flex h-32 items-center justify-center gap-2 px-6 text-center text-small text-muted-foreground'>
                        {waitingForWizardProject ? (
                            <>
                                <Spinner size={14} />
                                Loading...
                            </>
                        ) : (
                            'Project not found. It may have been removed.'
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <ProjectWizard
            mode={wizardState.mode}
            launchContext={wizardState.launchContext}
            project={wizardProject || undefined}
            initialEnvironmentKey={wizardState.initialEnvironmentKey}
            overlay={overlay}
            onProjectLimitReached={() => setShowUpgradeDialog(true)}
            onClose={handleClose}
            onDone={handleClose}
        />
    );
};
