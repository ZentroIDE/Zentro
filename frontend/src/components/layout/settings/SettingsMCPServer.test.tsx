// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../../platform/apiGatewayRuntime';
import { SettingsMCPServer } from './SettingsMCPServer';
import { useMCPServerSettings, type MCPServerSettingsModel } from './useMCPServerSettings';

// Harness mounts the section the way SettingsView does: the hook owns the calls.
function Harness() {
    return <SettingsMCPServer {...useMCPServerSettings()} />;
}

const base = {
    running: false,
    url: '',
    token: '',
    calls: 0,
    lastCall: '',
    blocked: '',
    autoStart: false,
    claudeDesktopFound: true,
    claudeDesktopConfigured: false,
    claudeCodeFound: true,
    nodeFound: true,
};
const running = {
    ...base,
    running: true,
    url: 'http://127.0.0.1:47391/mcp',
    token: 'secret-token',
    calls: 3,
};

function gateway(overrides: Record<string, unknown>) {
    return {
        ai: {
            getMCPStatus: async () => ({ ok: true as const, data: base }),
            ...overrides,
        },
    } as unknown as ApiGateway;
}

describe('SettingsMCPServer', () => {
    afterEach(() => resetApiGateway());

    it('starts the server and keeps the paste-it-yourself pieces under Manual setup', async () => {
        const startMCPServer = vi.fn(async () => ({ ok: true as const, data: running }));
        setApiGateway(gateway({ startMCPServer }));

        render(<Harness />);
        fireEvent.click(await screen.findByRole('switch', { name: 'Run the MCP server' }));
        await waitFor(() =>
            expect(screen.getByRole('switch', { name: 'Run the MCP server' })).toBeChecked(),
        );

        expect(screen.queryByRole('textbox', { name: 'MCP address' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Manual setup' }));

        expect(screen.getByRole('textbox', { name: 'MCP address' })).toHaveValue(
            'http://127.0.0.1:47391/mcp',
        );
        expect(screen.getByRole('textbox', { name: 'Claude Code command' })).toHaveValue(
            'claude mcp add --scope user --transport http zentro http://127.0.0.1:47391/mcp --header "Authorization: Bearer secret-token"',
        );
        expect(
            (screen.getByRole('textbox', { name: 'Cursor configuration' }) as HTMLTextAreaElement)
                .value,
        ).toContain('"url": "http://127.0.0.1:47391/mcp"');
        expect(
            (
                screen.getByRole('textbox', {
                    name: 'Claude Desktop configuration',
                }) as HTMLTextAreaElement
            ).value,
        ).toContain('"ZENTRO_AUTH": "Bearer secret-token"');
        expect(screen.getByLabelText('MCP token')).toHaveAttribute('type', 'password');
        expect(screen.getByText(/3 calls/)).toBeInTheDocument();
    });

    it('adds Zentro to Claude Desktop with one click', async () => {
        const connectMCPClient = vi.fn(async () => ({
            ok: true as const,
            data: { message: 'Added to Claude Desktop.', paths: ['x'] },
        }));
        setApiGateway(
            gateway({
                getMCPStatus: async () => ({ ok: true as const, data: running }),
                connectMCPClient,
            }),
        );

        render(<Harness />);
        const buttons = await screen.findAllByRole('button', { name: 'Add' });
        fireEvent.click(buttons[0]);

        await waitFor(() => expect(connectMCPClient).toHaveBeenCalledWith('claude-desktop'));
        expect(await screen.findByText('Added to Claude Desktop.')).toBeInTheDocument();
    });

    it('adds Zentro to Cursor from the same catalog as Claude', async () => {
        const connectMCPClient = vi.fn(async () => ({
            ok: true as const,
            data: { message: 'Added to Cursor.', paths: ['x'] },
        }));
        setApiGateway(
            gateway({
                getMCPStatus: async () => ({
                    ok: true as const,
                    data: {
                        ...running,
                        clients: [
                            {
                                id: 'claude-desktop',
                                found: true,
                                configured: false,
                                removable: true,
                            },
                            {
                                id: 'claude-code',
                                found: true,
                                configured: false,
                                removable: false,
                            },
                            { id: 'cursor', found: true, configured: false, removable: true },
                        ],
                    },
                }),
                connectMCPClient,
            }),
        );

        render(<Harness />);
        const addButtons = await screen.findAllByRole('button', { name: 'Add' });
        fireEvent.click(addButtons[2]);

        await waitFor(() => expect(connectMCPClient).toHaveBeenCalledWith('cursor'));
        expect(await screen.findByText('Added to Cursor.')).toBeInTheDocument();
    });

    it('cannot connect an agent that is not installed or while the server is off', async () => {
        setApiGateway(
            gateway({
                getMCPStatus: async () => ({
                    ok: true as const,
                    data: { ...base, claudeCodeFound: false },
                }),
            }),
        );

        render(<Harness />);
        expect(await screen.findByText('The claude command was not found.')).toBeInTheDocument();
        for (const button of screen.getAllByRole('button', { name: 'Add' })) {
            expect(button).toBeDisabled();
        }
    });

    it('remembers whether the server starts with Zentro', async () => {
        const setMCPAutoStart = vi.fn(async () => ({
            ok: true as const,
            data: { ...base, autoStart: true },
        }));
        setApiGateway(gateway({ setMCPAutoStart }));

        render(<Harness />);
        fireEvent.click(
            await screen.findByRole('switch', { name: 'Start the MCP server with Zentro' }),
        );

        await waitFor(() => expect(setMCPAutoStart).toHaveBeenCalledWith(true));
    });

    it('says why calls are refused', async () => {
        setApiGateway(
            gateway({
                getMCPStatus: async () => ({
                    ok: true as const,
                    data: { ...base, blocked: 'the active environment is production' },
                }),
            }),
        );

        render(<Harness />);

        expect(
            await screen.findByText(
                /Calls are refused right now: the active environment is production/,
            ),
        ).toBeInTheDocument();
    });

    it('draws only from its props and reports actions through them', () => {
        const model: MCPServerSettingsModel = {
            status: running,
            busy: false,
            error: '',
            message: 'Added to Claude Code for every folder.',
            setRunning: vi.fn(),
            setAutoStart: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            rotateToken: vi.fn(),
        };
        render(<SettingsMCPServer {...model} />);

        expect(screen.getByText('Added to Claude Code for every folder.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('switch', { name: 'Run the MCP server' }));
        expect(model.setRunning).toHaveBeenCalledWith(false);
        fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
        expect(model.rotateToken).toHaveBeenCalled();
    });
});
