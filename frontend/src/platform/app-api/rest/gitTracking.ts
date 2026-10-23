// SPDX-License-Identifier: GPL-3.0-only

import type { GitTrackingAdapter } from '../contracts/gitTracking';
import type { RestHttpClient } from './httpClient';

export function createGitTrackingRestAdapter(client: RestHttpClient): GitTrackingAdapter {
    return {
        enable: () => client.call('/git-tracking/enable'),
        disable: () => client.call('/git-tracking/disable'),
        getStatus: () => client.call('/git-tracking/get-status'),
        listTimeline: (limit, eventType) =>
            client.call('/git-tracking/list-timeline', { limit, eventType }),
        getCommitDiff: commitHash => client.call('/git-tracking/get-commit-diff', { commitHash }),
        getCommitFileDiffs: commitHash =>
            client.call('/git-tracking/get-commit-file-diffs', { commitHash }),
        manualCommit: message => client.call('/git-tracking/manual-commit', { message }),
        getPendingChanges: () => client.call('/git-tracking/get-pending-changes'),
        restoreCommit: commitHash => client.call('/git-tracking/restore-commit', { commitHash }),
        snapshotStoredProcedures: schema =>
            client.call('/git-tracking/snapshot-stored-procedures', { schema }),
        runMigration: () => client.call('/git-tracking/run-migration'),
    };
}
