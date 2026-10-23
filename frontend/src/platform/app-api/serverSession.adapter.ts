// SPDX-License-Identifier: GPL-3.0-only

import {
    ListServerSessions,
    CancelServerSession,
    KillServerSession,
} from '../../../wailsjs/go/app/App';
import type { app } from '../../../wailsjs/go/models';
import type { ServerSession } from './contracts/serverSession';

// wailsjs's generated app.ServerSessionView (models.ts) is structurally
// identical to our ServerSession contract, but startedAt is typed `any`
// (Wails has no Go time.Time -> TS mapping) since it's generated straight
// from the Go struct.
function mapServerSession(raw: app.ServerSessionView): ServerSession {
    return {
        id: raw.id,
        user: raw.user,
        database: raw.database,
        client: raw.client,
        state: raw.state,
        // raw.startedAt is typed `any` in the generated wailsjs model but is
        // an RFC 3339 string on the wire, same as every other timestamp
        // field elsewhere in this codebase's wailsjs models.
        startedAt: String(raw.startedAt),
        durationMs: raw.durationMs,
        wait: raw.wait,
        query: raw.query,
        isSelf: raw.isSelf,
    };
}

export const serverSessionAdapter = {
    ListServerSessions: async () => (await ListServerSessions()).map(mapServerSession),
    CancelServerSession,
    KillServerSession,
};
