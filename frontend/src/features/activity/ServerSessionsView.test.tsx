// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { ToastProvider } from '../../components/layout/Toast';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';
import { ServerSessionsView } from './ServerSessionsView';
import { useServerSessionsController } from './useServerSessionsController';

function makeSession(overrides: Partial<ServerSession> = {}): ServerSession {
    return {
        id: '100',
        user: 'app',
        database: 'shop',
        client: '10.0.0.1:5432',
        state: 'active',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        wait: '',
        query: 'SELECT * FROM orders',
        isSelf: false,
        ...overrides,
    };
}

function installGateway(sessions: ServerSession[]) {
    const list = vi.fn(async () => ({ ok: true as const, data: sessions }));
    const cancel = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const kill = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setApiGateway({
        serverSession: { list, cancel, kill },
    } as unknown as ApiGateway);
    return { list, cancel, kill };
}

// Radix's DropdownMenuTrigger opens on pointerdown, which plain
// fireEvent.click (a synthetic 'click' with no preceding pointerdown) does
// not emit in jsdom.
async function openSessionMenu(sessionId: string) {
    const trigger = screen.getByRole('button', {
        name: new RegExp(`Actions for session ${sessionId}`),
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    await screen.findByRole('menu');
}

// ServerSessionsView is now a pure presentational component fed by
// useServerSessionsController — this harness wires the real hook so these
// tests still exercise the full fetch/filter/kill integration, not just
// the view in isolation.
function TestHarness() {
    const controller = useServerSessionsController(true);
    return (
        <ServerSessionsView
            filtered={controller.filtered}
            error={controller.error}
            supported={controller.supported}
            killAction={controller.killAction}
            acting={controller.acting}
            isProduction={controller.isProduction}
            handleConfirmKill={controller.handleConfirmKill}
        />
    );
}

function renderView() {
    return render(
        <ToastProvider>
            <TestHarness />
        </ToastProvider>,
    );
}

describe('ServerSessionsView', () => {
    afterEach(() => {
        resetApiGateway();
        useEnvironmentStore.getState().clear();
    });

    it('lists sessions returned by the gateway', async () => {
        installGateway([makeSession({ id: '101', user: 'alex' })]);
        renderView();

        await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
        expect(screen.getByText('alex')).toBeInTheDocument();
    });

    it('shows a not-supported empty state when the driver has no SessionMonitor', async () => {
        const list = vi.fn(async () => ({
            ok: false as const,
            error: {
                code: 'serverSession.list.failed',
                message: 'server session listing is not supported for this driver',
            },
        }));
        setApiGateway({
            serverSession: { list, cancel: vi.fn(), kill: vi.fn() },
        } as unknown as ApiGateway);
        renderView();

        await waitFor(() =>
            expect(screen.getByText('Not supported for this driver')).toBeInTheDocument(),
        );
    });

    it('filters out idle sessions under the default Active filter', async () => {
        installGateway([
            makeSession({ id: '101', state: 'active' }),
            makeSession({ id: '102', state: 'idle' }),
        ]);
        renderView();

        await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
        expect(screen.queryByText('102')).not.toBeInTheDocument();
    });

    it('cancels a session without requiring typed confirmation outside production', async () => {
        const { cancel } = installGateway([makeSession({ id: '101' })]);
        renderView();

        await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
        await openSessionMenu('101');
        fireEvent.click(await screen.findByText('Cancel query'));

        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel statement' }));

        await waitFor(() => expect(cancel).toHaveBeenCalledWith('101'));
    });

    it('requires typing the session id before Terminate is enabled in production', async () => {
        useEnvironmentStore.setState({ activeEnvironmentKey: ENVIRONMENT_KEY.PRODUCTION });
        const { kill } = installGateway([makeSession({ id: '101' })]);
        renderView();

        await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
        await openSessionMenu('101');
        fireEvent.click(await screen.findByText('Kill session'));

        const dialog = await screen.findByRole('dialog');
        const terminateBtn = within(dialog).getByRole('button', { name: 'Terminate' });
        expect(terminateBtn).toBeDisabled();

        fireEvent.change(within(dialog).getByLabelText(/Type/), { target: { value: '101' } });
        expect(terminateBtn).not.toBeDisabled();

        fireEvent.click(terminateBtn);
        await waitFor(() => expect(kill).toHaveBeenCalledWith('101'));
    });

    it('disables session actions for Zentro’s own session', async () => {
        installGateway([makeSession({ id: '101', isSelf: true })]);
        renderView();

        await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());
        await openSessionMenu('101');
        const cancelItem = await screen.findByText('Cancel query');
        expect(cancelItem.closest('[role="menuitem"]')).toHaveAttribute('data-disabled');
    });
});
