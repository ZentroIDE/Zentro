// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { SourceControlAdapter } from '../contracts/sourceControl';
import type { RestHttpClient } from './httpClient';
import type { SCCommit, SCStatus } from '../types';

export function createSourceControlRestAdapter(client: RestHttpClient): SourceControlAdapter {
    return withKernelResult('sourceControl', {
        getStatus: () => client.call<SCStatus>('/source-control/get-status'),
        stageFile: (filePath: string) =>
            client.call<void>('/source-control/stage-file', { filePath }),
        unstageFile: (filePath: string) =>
            client.call<void>('/source-control/unstage-file', { filePath }),
        stageAll: () => client.call<void>('/source-control/stage-all'),
        commit: (message: string) => client.call<string>('/source-control/commit', { message }),
        getHistory: (limit: number) =>
            client.call<SCCommit[]>('/source-control/get-history', { limit }),
        getFileDiffs: (hash: string) =>
            client.call<import('../types').GitCommitFileDiff[]>('/source-control/get-file-diffs', {
                hash,
            }),
        getWorkingFileDiff: (filePath: string, staged: boolean) =>
            client.call<import('../types').GitCommitFileDiff>(
                '/source-control/get-working-file-diff',
                { filePath, staged },
            ),
        listBranches: () => client.call<string[]>('/source-control/list-branches'),
        checkoutBranch: (branchName: string) =>
            client.call<void>('/source-control/checkout-branch', { branchName }),
        createBranch: (branchName: string) =>
            client.call<void>('/source-control/create-branch', { branchName }),
        createBranchFrom: (branchName: string, fromRef: string) =>
            client.call<void>('/source-control/create-branch-from', {
                branchName,
                fromRef,
            }),
        checkoutDetached: (ref: string) =>
            client.call<void>('/source-control/checkout-detached', { ref }),
        initRepo: () => client.call<void>('/source-control/init-repo'),
        readGitIgnore: () => client.call<string>('/source-control/read-gitignore'),
        writeGitIgnore: (content: string) =>
            client.call<void>('/source-control/write-gitignore', { content }),
    });
}
