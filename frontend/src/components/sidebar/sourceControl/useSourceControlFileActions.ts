// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { TAB_TYPE } from '../../../lib/constants';
import type { GitCommitFileDiff, SCFileStatus } from '../../../platform/app-api/types';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';

interface UseSourceControlFileActionsArgs {
    addTab: (tabInit?: Record<string, unknown>, targetGroupId?: string) => string;
    toast: { error: (message: string) => void };
    getDisplayFileName: (path: string) => string;
    scriptNameById: Map<string, string>;
    activeProjectId?: string;
    activeProfileName?: string;
    setSelectedFileKey: React.Dispatch<React.SetStateAction<string | null>>;
    setWorkingDiffLoadingKey: React.Dispatch<React.SetStateAction<string | null>>;
    setGitIgnoreLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSourceControlFileActions({
    addTab,
    toast,
    getDisplayFileName,
    scriptNameById,
    activeProjectId,
    activeProfileName,
    setSelectedFileKey,
    setWorkingDiffLoadingKey,
    setGitIgnoreLoading,
}: UseSourceControlFileActionsArgs) {
    const handleOpenGitIgnoreEditor = React.useCallback(async () => {
        try {
            setGitIgnoreLoading(true);
            const content = unwrapOrThrow(await getApiGateway().sourceControl.readGitIgnore());
            addTab({
                id: 'source-control:.gitignore',
                type: TAB_TYPE.QUERY,
                name: '.gitignore',
                query: content || '',
                context: {
                    sourceControlFile: 'gitignore',
                    savedScriptId: undefined,
                    scriptProjectId: undefined,
                    scriptConnectionName: undefined,
                },
            });
        } catch (error) {
            toast.error(`Load .gitignore failed: ${error}`);
        } finally {
            setGitIgnoreLoading(false);
        }
    }, [addTab, setGitIgnoreLoading, toast]);

    const handleOpenDiff = React.useCallback(
        (hash: string, file: GitCommitFileDiff) => {
            const fileKey = `sc:${hash}:${file.path}`;
            setSelectedFileKey(fileKey);
            const fileName = getDisplayFileName(file.path);
            addTab({
                id: `git-diff:sc:${hash}:${file.path}`,
                type: TAB_TYPE.GIT_DIFF,
                name: `Changes - ${fileName}`,
                query: '',
                readOnly: true,
                gitDiffBefore: file.before,
                gitDiffAfter: file.after,
            });
        },
        [addTab, getDisplayFileName, setSelectedFileKey],
    );

    const handleOpenHistoryFileQuery = React.useCallback(
        (file: GitCommitFileDiff) => {
            const fileName = getDisplayFileName(file.path);
            addTab({
                type: TAB_TYPE.QUERY,
                name: fileName,
                query: file.after || file.before || '',
            });
        },
        [addTab, getDisplayFileName],
    );

    const handleOpenWorkingDiff = React.useCallback(
        async (file: SCFileStatus, stagedView: boolean) => {
            const fileKey = `wip:${stagedView ? 'staged' : 'unstaged'}:${file.path}`;
            setSelectedFileKey(fileKey);
            setWorkingDiffLoadingKey(fileKey);
            try {
                const diff = unwrapOrThrow(
                    await getApiGateway().sourceControl.getWorkingFileDiff(file.path, stagedView),
                );
                const fileName = getDisplayFileName(file.path);
                addTab({
                    id: `git-diff:sc:wip:${stagedView ? 'staged' : 'unstaged'}:${file.path}`,
                    type: TAB_TYPE.GIT_DIFF,
                    name: `${stagedView ? 'Staged' : 'Unstaged'} - ${fileName}`,
                    query: '',
                    readOnly: true,
                    gitDiffBefore: diff.before,
                    gitDiffAfter: diff.after,
                });
            } catch (error) {
                toast.error(`Load diff failed: ${error}`);
            } finally {
                setWorkingDiffLoadingKey(current => (current === fileKey ? null : current));
            }
        },
        [addTab, getDisplayFileName, setSelectedFileKey, setWorkingDiffLoadingKey, toast],
    );

    const handleOpenFileQuery = React.useCallback(
        async (file: SCFileStatus, stagedView: boolean) => {
            try {
                const diff = unwrapOrThrow(
                    await getApiGateway().sourceControl.getWorkingFileDiff(file.path, stagedView),
                );
                const fileName = getDisplayFileName(file.path);
                const rawFile = file.path.split('/').pop() ?? file.path;
                const scriptId = rawFile.toLowerCase().endsWith('.sql') ? rawFile.slice(0, -4) : '';
                const hasSavedScript = Boolean(scriptId && scriptNameById.has(scriptId));

                addTab({
                    type: TAB_TYPE.QUERY,
                    name: fileName,
                    query: diff.after || diff.before || '',
                    context:
                        hasSavedScript && activeProjectId && activeProfileName
                            ? {
                                  savedScriptId: scriptId,
                                  scriptProjectId: activeProjectId,
                                  scriptConnectionName: activeProfileName,
                              }
                            : undefined,
                });
            } catch (error) {
                toast.error(`Open file failed: ${error}`);
            }
        },
        [activeProfileName, activeProjectId, addTab, getDisplayFileName, scriptNameById, toast],
    );

    return {
        handleOpenGitIgnoreEditor,
        handleOpenDiff,
        handleOpenHistoryFileQuery,
        handleOpenWorkingDiff,
        handleOpenFileQuery,
    };
}
