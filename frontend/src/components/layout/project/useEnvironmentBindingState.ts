// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import type { ConnectionProfile } from '../../../types/connection';
import type { EnvironmentKey, Project } from '../../../types/project';
import type { DraftEnvironmentBinding } from './ProjectWizard.types';

interface UseEnvironmentBindingStateArgs {
    isEditMode: boolean;
    project?: Project;
    initialEnvironmentKey?: EnvironmentKey;
}

/**
 * Create-mode environment-binding state for the project dialog: bindings are
 * staged locally and the wizard applies them all on submit. Edit mode
 * persists each pick straight to the project (ProjectWizard.handleAutoBindFromTree)
 * and the matrix reads from the live project, so there's no local state for it.
 */
export function useEnvironmentBindingState({
    isEditMode,
    project,
    initialEnvironmentKey,
}: UseEnvironmentBindingStateArgs) {
    const [draftEnvironmentBindings, setDraftEnvironmentBindings] = React.useState<
        Partial<Record<EnvironmentKey, DraftEnvironmentBinding>>
    >({});
    const initKeyRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        const initKey =
            isEditMode && project ? `${project.id}:${initialEnvironmentKey || ''}` : 'create';
        if (initKeyRef.current === initKey) return;
        initKeyRef.current = initKey;
        setDraftEnvironmentBindings({});
    }, [initialEnvironmentKey, isEditMode, project]);

    const handleSelectFromTreeCreate = React.useCallback(
        (envKey: EnvironmentKey, profile: ConnectionProfile, database: string) => {
            if (!envKey) return;
            setDraftEnvironmentBindings(current => ({
                ...current,
                [envKey]: { profile, profileName: profile.name || '', database },
            }));
        },
        [],
    );

    const handleUnbind = React.useCallback((envKey: EnvironmentKey) => {
        setDraftEnvironmentBindings(current => {
            const next = { ...current };
            delete next[envKey];
            return next;
        });
    }, []);

    return {
        draftEnvironmentBindings,
        setDraftEnvironmentBindings,
        handleSelectFromTreeCreate,
        handleUnbind,
    };
}
