// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';
import type { SCCommit, SCStatus } from '../types';

export interface SourceControlAdapter {
    getStatus(): Promise<KernelResult<SCStatus>>;
    stageFile(filePath: string): Promise<KernelResult<void>>;
    unstageFile(filePath: string): Promise<KernelResult<void>>;
    stageAll(): Promise<KernelResult<void>>;
    commit(message: string): Promise<KernelResult<string>>;
    getHistory(limit: number): Promise<KernelResult<SCCommit[]>>;
    getFileDiffs(hash: string): Promise<KernelResult<import('../types').GitCommitFileDiff[]>>;
    getWorkingFileDiff(
        filePath: string,
        staged: boolean,
    ): Promise<KernelResult<import('../types').GitCommitFileDiff>>;
    listBranches(): Promise<KernelResult<string[]>>;
    checkoutBranch(branchName: string): Promise<KernelResult<void>>;
    createBranch(branchName: string): Promise<KernelResult<void>>;
    createBranchFrom(branchName: string, fromRef: string): Promise<KernelResult<void>>;
    checkoutDetached(ref: string): Promise<KernelResult<void>>;
    initRepo(): Promise<KernelResult<void>>;
    readGitIgnore(): Promise<KernelResult<string>>;
    writeGitIgnore(content: string): Promise<KernelResult<void>>;
}
