// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { mcpClientDescription, mcpClientRows } from './mcpClientCatalog';
import type { AIMCPStatus } from '../../../lib/aiAssistant';

const base: AIMCPStatus = {
    running: true,
    url: 'http://127.0.0.1:1/mcp',
    token: 't',
    calls: 0,
    lastCall: '',
    blocked: '',
    autoStart: false,
    claudeDesktopFound: true,
    claudeDesktopConfigured: false,
    claudeCodeFound: true,
    nodeFound: true,
};

describe('mcpClientRows', () => {
    it('prefers the backend catalog so a new agent does not need a new boolean', () => {
        const rows = mcpClientRows({
            ...base,
            clients: [
                { id: 'cursor', found: true, configured: true, removable: true },
                { id: 'windsurf', found: false, configured: false, removable: true },
            ],
        });
        expect(rows.map(row => row.id)).toEqual(['cursor', 'windsurf']);
    });

    it('falls back to the Claude fields when the catalog is missing', () => {
        const rows = mcpClientRows(base);
        expect(rows.map(row => row.id)).toEqual(['claude-desktop', 'claude-code']);
    });
});

describe('mcpClientDescription', () => {
    it('asks to start the server before connecting a found agent', () => {
        const row = { id: 'cursor', found: true, configured: false, removable: true };
        expect(mcpClientDescription({ ...base, running: false }, row, false)).toBe(
            'Turn on the MCP server first.',
        );
    });
});
