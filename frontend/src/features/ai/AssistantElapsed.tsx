// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/aiTime';

// AssistantElapsed counts up while a reply is on its way, once a second.
export function AssistantElapsed({ startedAt }: { startedAt: number }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    return (
        <p role='timer' aria-label='Time so far' className='text-label text-muted-foreground'>
            Working · {formatDuration(Math.max(1, now - startedAt))}
        </p>
    );
}
