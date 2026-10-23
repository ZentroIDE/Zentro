// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { Job, JobAdapter } from '../contracts/job';
import type { RestHttpClient } from './httpClient';

export function createJobRestAdapter(client: RestHttpClient): JobAdapter {
    return withKernelResult('job', {
        list: () => client.call<Job[]>('/job/list', {}),
        cancel: (id: string) => client.call<void>('/job/cancel', { id }),
        kill: (id: string) => client.call<void>('/job/kill', { id }),
        clearFinished: () => client.call<string[]>('/job/clear-finished', {}),
    });
}
