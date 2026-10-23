// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';

/** Formats a duration in milliseconds as `mm:ss`, or `hh:mm:ss` once it
 *  reaches an hour — matches the Activity panel mockup's elapsed column. */
export function formatElapsed(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
}

/** Ticks once a second while `live` is true, so a running Job's elapsed
 *  time visibly counts up without the whole Activity panel re-rendering:
 *  each JobRow only ticks when its own job is still running. Once
 *  `finishedAt` is set (live turns false), elapsed freezes at the actual
 *  run time instead of drifting with whatever `now` last was. */
export function useElapsed(
    startedAt: string,
    finishedAt: string | undefined,
    live: boolean,
): string {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!live) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [live]);

    const started = Date.parse(startedAt);
    if (Number.isNaN(started)) return formatElapsed(0);

    const end = !live && finishedAt ? Date.parse(finishedAt) : now;
    return formatElapsed((Number.isNaN(end) ? now : end) - started);
}
