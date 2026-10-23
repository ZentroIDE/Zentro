// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { ServerSession, ServerSessionAdapter } from '../contracts/serverSession';
import type { RestHttpClient } from './httpClient';

export function createServerSessionRestAdapter(client: RestHttpClient): ServerSessionAdapter {
    return withKernelResult('serverSession', {
        list: () => client.call<ServerSession[]>('/server-session/list', {}),
        cancel: (sessionId: string) => client.call<void>('/server-session/cancel', { sessionId }),
        kill: (sessionId: string) => client.call<void>('/server-session/kill', { sessionId }),
    });
}
