// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../platform/apiGatewayRuntime';
import type {
    GitCommitFileDiff,
    GitCommitResult,
    GitTimelineItem,
    GitTrackingStatus,
} from '../platform/app-api/types';

export const EnableGitTracking = () => getApiGateway().gitTracking.enable();
export const DisableGitTracking = () => getApiGateway().gitTracking.disable();
export const GetGitTrackingStatus = (): Promise<GitTrackingStatus> =>
    getApiGateway().gitTracking.getStatus();
export const ListGitTimeline = (limit = 100, eventType = ''): Promise<GitTimelineItem[]> =>
    getApiGateway().gitTracking.listTimeline(limit, eventType);
export const GetGitCommitDiff = (commitHash: string) =>
    getApiGateway().gitTracking.getCommitDiff(commitHash);
export const GetCommitFileDiffs = (commitHash: string): Promise<GitCommitFileDiff[]> =>
    getApiGateway().gitTracking.getCommitFileDiffs(commitHash);
export const ManualGitCommit = (message = ''): Promise<GitCommitResult> =>
    getApiGateway().gitTracking.manualCommit(message);
export const GetGitPendingChanges = (): Promise<string[]> =>
    getApiGateway().gitTracking.getPendingChanges();
export const RestoreGitCommit = (commitHash: string): Promise<void> =>
    getApiGateway().gitTracking.restoreCommit(commitHash);
export const SnapshotStoredProcedures = (schema = '') =>
    getApiGateway().gitTracking.snapshotStoredProcedures(schema);
export const RunGitTrackingMigration = () => getApiGateway().gitTracking.runMigration();
