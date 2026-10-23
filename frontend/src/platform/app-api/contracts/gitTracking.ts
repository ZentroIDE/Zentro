// SPDX-License-Identifier: GPL-3.0-only

export interface GitTrackingAdapter {
    enable(): Promise<void>;
    disable(): Promise<void>;
    getStatus(): Promise<import('../types').GitTrackingStatus>;
    listTimeline(limit: number, eventType: string): Promise<import('../types').GitTimelineItem[]>;
    getCommitDiff(commitHash: string): Promise<string>;
    getCommitFileDiffs(commitHash: string): Promise<import('../types').GitCommitFileDiff[]>;
    manualCommit(message: string): Promise<import('../types').GitCommitResult>;
    getPendingChanges(): Promise<string[]>;
    restoreCommit(commitHash: string): Promise<void>;
    snapshotStoredProcedures(schema: string): Promise<number>;
    runMigration(): Promise<void>;
}
