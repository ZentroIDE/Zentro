// SPDX-License-Identifier: GPL-3.0-only

import type { AIChatApprovalResult } from '../../lib/aiAssistant';

// RowTable is one tool result drawn as a table for the approval dialog. When
// the result cannot be read as rows, raw holds it as sent, so the user still
// sees exactly what would leave.
export interface RowTable {
    title: string;
    columns: string[];
    rows: string[][];
    raw?: string;
}

interface Envelope {
    data?: {
        columns?: { name?: string }[];
        rows?: unknown[][];
        keySamples?: unknown[][] | null;
    };
}

function cells(row: unknown[]): string[] {
    return row.map(cell => (cell === null || cell === undefined ? '' : String(cell)));
}

// approvalTables reads each result the reply wants to send. run_readonly_query
// carries columns and rows; estimate_impact carries primary-key samples.
export function approvalTables(results: AIChatApprovalResult[]): RowTable[] {
    return results.map(result => {
        const title = result.label || result.tool;
        let envelope: Envelope;
        try {
            envelope = JSON.parse(result.content) as Envelope;
        } catch {
            return { title, columns: [], rows: [], raw: result.content };
        }
        const data = envelope.data;
        if (data?.rows && data.columns) {
            return {
                title,
                columns: data.columns.map(column => column.name ?? ''),
                rows: data.rows.map(cells),
            };
        }
        if (data?.keySamples) {
            const width = data.keySamples[0]?.length ?? 1;
            return {
                title,
                columns: Array.from({ length: width }, (_, i) =>
                    width === 1 ? 'key' : `key ${i + 1}`,
                ),
                rows: data.keySamples.map(cells),
            };
        }
        return { title, columns: [], rows: [], raw: result.content };
    });
}

export function approvalRowCount(results: AIChatApprovalResult[]): number {
    return results.reduce((total, result) => total + result.rows, 0);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// readableBody indents a request body for reading. The body is sent compact,
// which is what the user approved; only the display is spaced out. A body that
// is not JSON is shown as it is.
export function readableBody(body: string): string {
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
        return body;
    }
}
