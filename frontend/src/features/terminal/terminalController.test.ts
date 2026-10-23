// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeFitAddon, FakeTerminal, resetXtermMock } from './xtermMock';

vi.mock('@xterm/xterm', async () => {
    const mock = await import('./xtermMock');
    return { Terminal: mock.FakeTerminal };
});
vi.mock('@xterm/addon-fit', async () => {
    const mock = await import('./xtermMock');
    return { FitAddon: mock.FakeFitAddon };
});

const gateway = {
    open: vi.fn(),
    write: vi.fn(async () => ({ ok: true as const, data: undefined })),
    resize: vi.fn(async () => ({ ok: true as const, data: undefined })),
    close: vi.fn(async () => ({ ok: true as const, data: undefined })),
};

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ terminal: gateway }),
}));

import { useTerminalStore } from '../../stores/terminalStore';
import {
    closeAllTerminals,
    closeTerminal,
    handleTerminalData,
    handleTerminalExit,
    openTerminal,
} from './terminalController';
import { createLiveTerminal, getLiveTerminal } from './terminalRegistry';

const bytes = (s: string) => new TextEncoder().encode(s);

function opens(id: string, kind: 'local' | 'ssh' = 'local', title = 'PowerShell') {
    gateway.open.mockResolvedValueOnce({ ok: true, data: { id, kind, title } });
}

describe('terminalController', () => {
    beforeEach(() => {
        resetXtermMock();
        gateway.open.mockReset();
        gateway.write.mockClear();
        gateway.resize.mockClear();
        gateway.close.mockClear();
        useTerminalStore.getState().clear();
    });

    it('opens a shell, adds its tab and wires keystrokes and resizes to the backend', async () => {
        opens('t1');

        await openTerminal('local');

        expect(gateway.open).toHaveBeenCalledWith('local', '', 80, 24);
        expect(useTerminalStore.getState().tabs).toMatchObject([
            { id: 't1', kind: 'local', title: 'PowerShell', exited: false },
        ]);
        expect(useTerminalStore.getState().activeId).toBe('t1');

        const term = FakeTerminal.instances[0];
        term.type('ls\r');
        term.resizeTo(132, 43);
        expect(gateway.write).toHaveBeenCalledWith('t1', 'ls\r');
        expect(gateway.resize).toHaveBeenCalledWith('t1', 132, 43);
    });

    it('passes the connection id when opening an SSH shell', async () => {
        opens('t1', 'ssh', 'me@bastion');

        await openTerminal('ssh', 'conn-9');

        expect(gateway.open).toHaveBeenCalledWith('ssh', 'conn-9', 80, 24);
        expect(useTerminalStore.getState().tabs[0]).toMatchObject({
            kind: 'ssh',
            title: 'me@bastion',
        });
    });

    it('throws the backend message and leaves no tab when the shell cannot start', async () => {
        gateway.open.mockResolvedValueOnce({
            ok: false,
            error: {
                code: 'terminal.open.failed',
                message: 'Failed',
                context: { cause: 'no pty here' },
            },
        });

        await expect(openTerminal('local')).rejects.toThrow('no pty here');

        expect(useTerminalStore.getState().tabs).toEqual([]);
        expect(FakeTerminal.instances).toEqual([]);
    });

    it('writes shell output into the terminal', async () => {
        opens('t1');
        await openTerminal('local');

        handleTerminalData({ id: 't1', data: bytes('hello ') });
        handleTerminalData({ id: 't1', data: bytes('world') });

        expect(FakeTerminal.instances[0].text()).toBe('hello world');
    });

    it('holds output that arrives before the terminal exists, in order', () => {
        // The shell prints its prompt before TerminalOpen has even returned.
        handleTerminalData({ id: 'early', data: bytes('PS C:\\> ') });
        handleTerminalData({ id: 'early', data: bytes('ready') });

        createLiveTerminal('early', { onInput: vi.fn(), onResize: vi.fn() });

        expect(FakeTerminal.instances[0].text()).toBe('PS C:\\> ready');
    });

    it('applies an exit that arrived before the tab was created', async () => {
        // A fresh id: the backend never reuses one, and ids the user already
        // closed (like "t1" above) are deliberately ignored from then on.
        handleTerminalExit({ id: 'exit-early', exitCode: 7 });
        opens('exit-early');

        await openTerminal('local');

        expect(useTerminalStore.getState().tabs[0]).toMatchObject({ exited: true, exitCode: 7 });
    });

    it('marks the tab exited and tells the user in the terminal', async () => {
        opens('t1');
        await openTerminal('local');

        handleTerminalExit({ id: 't1', exitCode: 130 });

        expect(useTerminalStore.getState().tabs[0]).toMatchObject({ exited: true, exitCode: 130 });
        expect(FakeTerminal.instances[0].text()).toContain('process exited with code 130');
    });

    it('closes a tab: ends the shell, disposes the terminal and drops late output', async () => {
        opens('t1');
        await openTerminal('local');

        closeTerminal('t1');

        expect(gateway.close).toHaveBeenCalledWith('t1');
        expect(FakeTerminal.instances[0].disposed).toBe(true);
        expect(getLiveTerminal('t1')).toBeUndefined();
        expect(useTerminalStore.getState().tabs).toEqual([]);

        // The backend still reports the shell's last output and exit for a
        // session the user closed; neither may linger for a reused id.
        handleTerminalData({ id: 't1', data: bytes('late') });
        handleTerminalExit({ id: 't1', exitCode: 0 });
        const reused = createLiveTerminal('t1', { onInput: vi.fn(), onResize: vi.fn() });
        expect((reused.term as unknown as FakeTerminal).text()).toBe('');
    });

    it('closes every shell at once', async () => {
        opens('a');
        opens('b');
        await openTerminal('local');
        await openTerminal('local');

        closeAllTerminals();

        expect(gateway.close).toHaveBeenCalledTimes(2);
        expect(FakeTerminal.instances.every(t => t.disposed)).toBe(true);
        expect(useTerminalStore.getState().tabs).toEqual([]);
        expect(useTerminalStore.getState().activeId).toBeNull();
    });

    it('fits through the addon only when asked to', async () => {
        opens('t1');
        await openTerminal('local');
        expect(FakeFitAddon.fits).toBe(0);
    });
});
