// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';

import { useProjectStore } from '../../../stores/projectStore';
import { useGitBranchStore } from '../../../stores/gitBranchStore';

/**
 * Thin adapter over gitBranchStore for the toolbar's branch label/button.
 * Derives `hasGitRepo` from the active project and keeps the shared store
 * loaded; branch actions live in the Spotlight palette's `@git` mode.
 */
export function useGitBranchLogic() {
    const activeProject = useProjectStore(s => s.activeProject);
    const hasGitRepo = Boolean(activeProject?.storage_path);

    const gitBranch = useGitBranchStore(s => s.branch);
    const gitBranchLoading = useGitBranchStore(s => s.loading);
    const load = useGitBranchStore(s => s.load);

    useEffect(() => {
        void load(hasGitRepo);
    }, [hasGitRepo, load]);

    return {
        hasGitRepo,
        gitBranch,
        gitBranchLoading,
    };
}
