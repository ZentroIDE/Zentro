// SPDX-License-Identifier: GPL-3.0-only

// A tab can ask to run its query as soon as its editor is ready. The
// assistant's "Execute on" opens a new tab and wants it to run, but a command
// sent right away arrives before the new tab's editor exists and is lost. The
// editor takes the request when it mounts and runs through its normal path,
// so the write-safety checks still apply.
const pending = new Set<string>();

export function requestRunWhenReady(tabId: string): void {
    if (tabId) pending.add(tabId);
}

// takePendingRun reports whether tabId asked to run, and forgets the request.
export function takePendingRun(tabId: string): boolean {
    return pending.delete(tabId);
}
