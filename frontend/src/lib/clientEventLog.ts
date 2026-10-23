// SPDX-License-Identifier: GPL-3.0-only

import { getApiGateway } from '../platform/apiGatewayRuntime';

// Fire-and-forget bridge into the backend's structured app log (tagged
// "[fe]"), so a click-to-data-loaded timeline reads as one ordered stream
// by timestamp instead of correlating separate FE/BE logs by hand. Temporary
// diagnostic aid for the table-tab-open latency investigation — remove once
// the root cause is confirmed and fixed (see ADR-0001 follow-up).
export function logClientEvent(message: string, fields: Record<string, string>): void {
    void getApiGateway().audit.logClientEvent(message, fields);
}
