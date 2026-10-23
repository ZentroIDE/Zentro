// SPDX-License-Identifier: GPL-3.0-only

import type { AIMCPClient, AIMCPClientPresence, AIMCPStatus } from '../../../lib/aiAssistant';

export interface MCPClientCopy {
    title: string;
    notFound: string;
    found: string;
    configured: string;
    needsServer: string;
}

const COPY: Record<string, MCPClientCopy> = {
    'claude-desktop': {
        title: 'Claude Desktop',
        notFound: 'Not found on this computer.',
        found: 'Found, not set up.',
        configured: 'Set up. Quit and reopen Claude Desktop after a change.',
        needsServer: 'Turn on the MCP server first.',
    },
    'claude-code': {
        title: 'Claude Code',
        notFound: 'The claude command was not found.',
        found: 'Adds Zentro for every folder.',
        configured: 'Adds Zentro for every folder.',
        needsServer: 'Turn on the MCP server first.',
    },
    cursor: {
        title: 'Cursor',
        notFound: 'Not found on this computer.',
        found: 'Found, not set up.',
        configured: 'Set up. Reload MCP in Cursor after a change.',
        needsServer: 'Turn on the MCP server first.',
    },
};

// mcpClientRows is what Settings draws. The backend catalog is the source of
// truth; older status payloads without clients still show Claude.
export function mcpClientRows(status: AIMCPStatus | null): AIMCPClientPresence[] {
    if (status?.clients && status.clients.length > 0) {
        return status.clients;
    }
    if (!status) return [];
    return [
        {
            id: 'claude-desktop',
            found: status.claudeDesktopFound,
            configured: status.claudeDesktopConfigured,
            removable: true,
        },
        {
            id: 'claude-code',
            found: status.claudeCodeFound,
            configured: false,
            removable: false,
        },
    ];
}

export function mcpClientCopy(id: string): MCPClientCopy {
    return (
        COPY[id] ?? {
            title: id,
            notFound: 'Not found on this computer.',
            found: 'Found, not set up.',
            configured: 'Set up.',
            needsServer: 'Turn on the MCP server first.',
        }
    );
}

export function mcpClientDescription(
    status: AIMCPStatus | null,
    row: AIMCPClientPresence,
    running: boolean,
): string {
    const copy = mcpClientCopy(row.id);
    if (!row.found) return copy.notFound;
    if (!running) return copy.needsServer;
    if (row.configured) {
        if (row.id === 'claude-desktop' && status && !status.nodeFound) {
            return 'Set up, but Node.js is missing. Install it from nodejs.org.';
        }
        return copy.configured;
    }
    return copy.found;
}

export function asMCPClient(id: string): AIMCPClient {
    return id as AIMCPClient;
}
