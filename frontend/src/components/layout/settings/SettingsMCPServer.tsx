// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Button, Input, Textarea } from '../../ui';
import type { MCPServerSettingsModel } from './useMCPServerSettings';
import { SettingAction, SettingField, SettingGroupTitle, SettingToggle } from './SettingItem';
import {
    asMCPClient,
    mcpClientCopy,
    mcpClientDescription,
    mcpClientRows,
} from './mcpClientCatalog';

function copy(text: string) {
    void navigator.clipboard.writeText(text);
}

// SettingsMCPServer runs the MCP server that external agents (Claude Desktop,
// Claude Code, an IDE) use to read the schema through Zentro. It follows
// docs/rules/settings-ui.md: flat rows, a switch for on and off, one row per
// agent, and the paste-it-yourself pieces folded away.
export function SettingsMCPServer({
    status,
    busy,
    error,
    message,
    setRunning,
    setAutoStart,
    connect,
    disconnect,
    rotateToken,
}: MCPServerSettingsModel) {
    const [showToken, setShowToken] = useState(false);
    const [showManual, setShowManual] = useState(false);

    const running = Boolean(status?.running);
    const authHeader = status ? `Bearer ${status.token}` : '';
    const claudeCommand = status
        ? `claude mcp add --scope user --transport http zentro ${status.url} --header "Authorization: ${authHeader}"`
        : '';
    const desktopConfig = status
        ? JSON.stringify(
              {
                  mcpServers: {
                      zentro: {
                          command: 'npx',
                          args: [
                              '-y',
                              'mcp-remote',
                              status.url,
                              '--allow-http',
                              '--transport',
                              'http-only',
                              '--header',
                              'Authorization:${ZENTRO_AUTH}',
                          ],
                          env: { ZENTRO_AUTH: authHeader },
                      },
                  },
              },
              null,
              2,
          )
        : '';

    const cursorConfig = status
        ? JSON.stringify(
              {
                  mcpServers: {
                      zentro: {
                          url: status.url,
                          headers: { Authorization: authHeader },
                      },
                  },
              },
              null,
              2,
          )
        : '';
    const rows = mcpClientRows(status);

    return (
        <>
            <SettingGroupTitle
                title='External agents (MCP)'
                description='Claude Desktop, Claude Code, Cursor, or another IDE can read the structure of the open connection through Zentro. No rows, no SQL. The agent may send what it reads to its own model.'
            />
            <SettingToggle
                title='MCP server'
                description={
                    running && status
                        ? `Listening on ${status.url} · ${status.calls} calls`
                        : 'Off. Listens on this computer only, behind a token.'
                }
                checked={running}
                disabled={busy || !status}
                ariaLabel='Run the MCP server'
                onCheckedChange={checked => setRunning(Boolean(checked))}
            />
            <SettingToggle
                title='Start with Zentro'
                description='Agents you set up keep working after Zentro restarts.'
                checked={Boolean(status?.autoStart)}
                disabled={busy || !status}
                ariaLabel='Start the MCP server with Zentro'
                onCheckedChange={checked => setAutoStart(Boolean(checked))}
            />
            {rows.map(row => {
                const labels = mcpClientCopy(row.id);
                const client = asMCPClient(row.id);
                return (
                    <SettingAction
                        key={row.id}
                        title={labels.title}
                        description={mcpClientDescription(status, row, running)}
                    >
                        {row.configured && row.removable && (
                            <Button
                                type='button'
                                variant='ghost'
                                tone='destructive'
                                disabled={busy}
                                onClick={() => disconnect(client)}
                            >
                                Remove
                            </Button>
                        )}
                        <Button
                            type='button'
                            disabled={busy || !running || !row.found}
                            onClick={() => connect(client)}
                        >
                            {row.configured ? 'Update' : 'Add'}
                        </Button>
                    </SettingAction>
                );
            })}

            {running && status && (
                <>
                    <SettingAction
                        title='Token'
                        description='Rotate it if it was shared. Then add each agent again.'
                    >
                        <Button
                            type='button'
                            variant='ghost'
                            tone='destructive'
                            disabled={busy}
                            onClick={() => rotateToken()}
                        >
                            Rotate
                        </Button>
                        <Button
                            type='button'
                            variant='ghost'
                            aria-expanded={showManual}
                            onClick={() => setShowManual(value => !value)}
                        >
                            {showManual ? 'Hide manual setup' : 'Manual setup'}
                        </Button>
                    </SettingAction>
                    {showManual && (
                        <>
                            <SettingField label='Address'>
                                <div className='flex gap-1.5'>
                                    <Input readOnly value={status.url} aria-label='MCP address' />
                                    <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() => copy(status.url)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </SettingField>
                            <SettingField label='Token'>
                                <div className='flex gap-1.5'>
                                    <Input
                                        readOnly
                                        type={showToken ? 'text' : 'password'}
                                        value={status.token}
                                        aria-label='MCP token'
                                    />
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        aria-pressed={showToken}
                                        onClick={() => setShowToken(value => !value)}
                                    >
                                        {showToken ? 'Hide' : 'Show'}
                                    </Button>
                                    <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() => copy(status.token)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </SettingField>
                            <SettingField label='Claude Code (terminal)'>
                                <div className='flex items-start gap-1.5'>
                                    <Textarea
                                        readOnly
                                        value={claudeCommand}
                                        aria-label='Claude Code command'
                                        className='min-h-12 font-mono'
                                    />
                                    <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() => copy(claudeCommand)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </SettingField>
                            <SettingField
                                label='Cursor'
                                helperText='Goes in ~/.cursor/mcp.json (user-level, every folder). Cursor talks HTTP itself; Zentro must stay open.'
                            >
                                <div className='flex items-start gap-1.5'>
                                    <Textarea
                                        readOnly
                                        value={cursorConfig}
                                        aria-label='Cursor configuration'
                                        className='min-h-32 font-mono'
                                    />
                                    <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() => copy(cursorConfig)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </SettingField>
                            <SettingField
                                label='Claude Desktop'
                                helperText='Goes in claude_desktop_config.json under Settings › Developer. Needs Node.js. Custom connectors on claude.ai are called from Anthropic’s servers and cannot reach this computer.'
                            >
                                <div className='flex items-start gap-1.5'>
                                    <Textarea
                                        readOnly
                                        value={desktopConfig}
                                        aria-label='Claude Desktop configuration'
                                        className='min-h-32 font-mono'
                                    />
                                    <Button
                                        type='button'
                                        variant='outline'
                                        onClick={() => copy(desktopConfig)}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </SettingField>
                        </>
                    )}
                </>
            )}

            {status?.blocked && (
                <p className='text-label text-muted-foreground'>
                    Calls are refused right now: {status.blocked}.
                </p>
            )}
            {message && <p className='text-label text-muted-foreground'>{message}</p>}
            {error && <p className='text-label text-destructive'>{error}</p>}
        </>
    );
}
