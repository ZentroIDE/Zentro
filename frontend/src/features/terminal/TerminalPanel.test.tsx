// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FakeTerminal, resetXtermMock } from './xtermMock';

vi.mock('@xterm/xterm', async () => {
    const mock = await import('./xtermMock');
    return { Terminal: mock.FakeTerminal };
});
vi.mock('@xterm/addon-fit', async () => {
    const mock = await import('./xtermMock');
    return { FitAddon: mock.FakeFitAddon };
});
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const gateway = {
    terminal: {
        open: vi.fn(),
        write: vi.fn(async () => ({ ok: true as const, data: undefined })),
        resize: vi.fn(async () => ({ ok: true as const, data: undefined })),
        close: vi.fn(async () => ({ ok: true as const, data: undefined })),
    },
    connection: {
        loadConnections: vi.fn(),
    },
};

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => gateway,
}));

class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalPanel } from './TerminalPanel';

function opens(id: string, title = 'PowerShell', kind: 'local' | 'ssh' = 'local') {
    gateway.terminal.open.mockResolvedValueOnce({ ok: true, data: { id, kind, title } });
}

// Radix's DropdownMenuTrigger opens on pointerdown, which a plain
// fireEvent.click does not emit in jsdom.
async function openNewMenu() {
    const trigger = screen.getByRole('button', { name: 'New terminal' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    await screen.findByRole('menu');
}

const connections = [
    { id: 'c1', name: 'plain db', ssh_enabled: false },
    { id: 'c2', name: 'prod via bastion', ssh_enabled: true, ssh_user: 'me', ssh_host: 'bastion' },
];

describe('TerminalPanel', () => {
    beforeEach(() => {
        resetXtermMock();
        useTerminalStore.getState().clear();
        gateway.terminal.open.mockReset();
        gateway.terminal.close.mockClear();
        gateway.connection.loadConnections.mockReset();
        gateway.connection.loadConnections.mockResolvedValue({ ok: true, data: connections });
    });

    it('shows an empty state with a button that opens a local shell', async () => {
        opens('t1');
        render(<TerminalPanel />);

        expect(screen.getByRole('button', { name: 'New Local Terminal' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));

        await waitFor(() =>
            expect(screen.getByRole('tab', { name: /PowerShell/ })).toBeInTheDocument(),
        );
        expect(gateway.terminal.open).toHaveBeenCalledWith('local', '', 80, 24);
    });

    it('attaches the active terminal to the host and focuses it', async () => {
        opens('t1');
        const { container } = render(<TerminalPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));

        await waitFor(() => expect(FakeTerminal.instances[0]?.opened).toBe(true));
        const host = container.querySelector('.zentro-terminal');
        expect(host).not.toBeNull();
        expect(host?.querySelector('.xterm')).not.toBeNull();
        expect(FakeTerminal.instances[0].focused).toBe(true);
    });

    it('keeps its sessions across an unmount and shows them again on remount', async () => {
        opens('t1');
        const first = render(<TerminalPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));
        await waitFor(() => expect(FakeTerminal.instances[0]?.opened).toBe(true));

        // Another bottom-panel tab is selected, then the user comes back.
        first.unmount();
        const second = render(<TerminalPanel />);

        expect(screen.getByRole('tab', { name: /PowerShell/ })).toBeInTheDocument();
        await waitFor(() =>
            expect(second.container.querySelector('.zentro-terminal .xterm')).not.toBeNull(),
        );
        expect(FakeTerminal.instances).toHaveLength(1); // same xterm, not a new one
        expect(FakeTerminal.instances[0].disposed).toBe(false);
    });

    it('switches between sessions', async () => {
        opens('t1', 'one');
        opens('t2', 'two');
        render(<TerminalPanel />);

        await openNewMenu();
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Local shell' }));
        await screen.findByRole('tab', { name: /one/ });
        await openNewMenu();
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Local shell' }));
        await screen.findByRole('tab', { name: /two/ });

        expect(screen.getByRole('tab', { name: /two/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(screen.getByRole('tab', { name: /one/ }));
        expect(screen.getByRole('tab', { name: /one/ })).toHaveAttribute('aria-selected', 'true');
        expect(useTerminalStore.getState().activeId).toBe('t1');
    });

    it('closes a session from its tab', async () => {
        opens('t1');
        render(<TerminalPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));
        await screen.findByRole('tab', { name: /PowerShell/ });

        fireEvent.click(screen.getByRole('button', { name: 'Close PowerShell' }));

        expect(gateway.terminal.close).toHaveBeenCalledWith('t1');
        expect(screen.getByRole('button', { name: 'New Local Terminal' })).toBeInTheDocument();
    });

    it('offers an SSH shell only for connections that have a tunnel', async () => {
        render(<TerminalPanel />);

        await waitFor(() => expect(gateway.connection.loadConnections).toHaveBeenCalled());
        await act(async () => {});
        await openNewMenu();

        expect(
            await screen.findByRole('menuitem', { name: /prod via bastion/ }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: /plain db/ })).not.toBeInTheDocument();
    });

    it('opens an SSH shell for the chosen connection', async () => {
        opens('t1', 'me@bastion', 'ssh');
        render(<TerminalPanel />);
        await waitFor(() => expect(gateway.connection.loadConnections).toHaveBeenCalled());
        await act(async () => {});

        await openNewMenu();
        fireEvent.click(await screen.findByRole('menuitem', { name: /prod via bastion/ }));

        await waitFor(() =>
            expect(gateway.terminal.open).toHaveBeenCalledWith('ssh', 'c2', 80, 24),
        );
        expect(await screen.findByRole('tab', { name: /SSH · me@bastion/ })).toBeInTheDocument();
    });

    it('shows why a shell could not start', async () => {
        gateway.terminal.open.mockResolvedValueOnce({
            ok: false,
            error: {
                code: 'x',
                message: 'Failed',
                context: { cause: 'ssh tunnel: authentication failed' },
            },
        });
        render(<TerminalPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'ssh tunnel: authentication failed',
        );
        expect(screen.getByRole('button', { name: 'New Local Terminal' })).toBeInTheDocument();
    });

    it('offers a restart once the shell has exited, and keeps the old tab until the new one is up', async () => {
        opens('t1', 'me@bastion', 'ssh');
        opens('t2', 'me@bastion', 'ssh');
        render(<TerminalPanel />);
        await waitFor(() => expect(gateway.connection.loadConnections).toHaveBeenCalled());
        await act(async () => {});
        fireEvent.click(
            await screen.findByRole('button', { name: /SSH Shell · prod via bastion/ }),
        );
        await screen.findByRole('tab', { name: /me@bastion/ });

        act(() => useTerminalStore.getState().markExited('t1', 2));
        expect(screen.getByRole('status')).toHaveTextContent('Shell exited (code 2)');

        fireEvent.click(screen.getByRole('button', { name: /Restart/ }));

        await waitFor(() => expect(useTerminalStore.getState().activeId).toBe('t2'));
        expect(gateway.terminal.open).toHaveBeenLastCalledWith('ssh', 'c2', 80, 24);
        expect(gateway.terminal.close).toHaveBeenCalledWith('t1');
        expect(useTerminalStore.getState().tabs.map(tab => tab.id)).toEqual(['t2']);
    });

    it('copies the selection on Ctrl+C and lets Ctrl+C through to the shell otherwise', async () => {
        const writeText = vi.fn(async () => {});
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        opens('t1');
        render(<TerminalPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'New Local Terminal' }));
        await waitFor(() => expect(FakeTerminal.instances[0]?.opened).toBe(true));
        const term = FakeTerminal.instances[0];
        const ctrlC = () => new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });

        expect(term.press(ctrlC())).toBe(true); // nothing selected: interrupt

        term.selection = 'select 1';
        expect(term.press(ctrlC())).toBe(false);
        expect(writeText).toHaveBeenCalledWith('select 1');
        expect(term.hasSelection()).toBe(false);
        vi.unstubAllGlobals();
        vi.stubGlobal('ResizeObserver', StubResizeObserver);
    });
});
