// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { EnvironmentMatrix } from './EnvironmentMatrix';
import type { ConnectionProfile } from '../../../types/connection';

const loadDatabasesForConnection = vi.fn();

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: { loadDatabasesForConnection },
    }),
}));

vi.mock('../../../../wailsjs/go/models', () => ({
    models: {
        ConnectionProfile: class {
            constructor(data: Partial<ConnectionProfile>) {
                Object.assign(this, data);
            }
        },
    },
}));

function makeProfile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
    return {
        id: 'conn-dev-pg',
        name: 'dev-pg',
        driver: 'postgres',
        host: 'localhost',
        port: 5432,
        db_name: 'appdb',
        username: 'u',
        password: '',
        connect_timeout: 10,
        save_password: true,
        show_all_schemas: false,
        trust_server_cert: false,
        ...overrides,
    };
}

/** Resolve the dialog trigger element that owns `el` (the button /
 * role="button" wrapper). */
function triggerFor(el: HTMLElement): HTMLElement {
    return (el.closest('button, [role="button"]') as HTMLElement) ?? el;
}

/** Click an environment row open and return the picker dialog content. */
async function openPicker(triggerText: string): Promise<HTMLElement> {
    fireEvent.click(triggerFor(screen.getAllByText(triggerText)[0]));
    return screen.findByTestId('env-binding-picker');
}

describe('EnvironmentMatrix', () => {
    beforeEach(() => {
        loadDatabasesForConnection.mockReset();
        loadDatabasesForConnection.mockResolvedValue({
            ok: true,
            data: ['appdb', 'appdb_staging'],
        });
    });

    it('renders exactly the 3 fixed environments and no "add environment" affordance', () => {
        render(
            <EnvironmentMatrix
                connections={[]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        expect(screen.getByText('Development')).toBeInTheDocument();
        expect(screen.getByText('Staging')).toBeInTheDocument();
        expect(screen.getByText('Production')).toBeInTheDocument();
        expect(screen.queryByText(/add environment/i)).not.toBeInTheDocument();
    });

    it('shows the dashed "Bind connection & database" affordance when unbound', () => {
        render(
            <EnvironmentMatrix
                connections={[]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        expect(screen.getAllByText('Bind connection & database')).toHaveLength(3);
    });

    it('shows the bound connection, host and database in the chip', () => {
        const profile = makeProfile();
        render(
            <EnvironmentMatrix
                connections={[profile]}
                getBinding={envKey =>
                    envKey === 'dev' ? { connectionRef: 'conn-dev-pg', database: 'appdb' } : null
                }
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        expect(screen.getByText('dev-pg')).toBeInTheDocument();
        expect(screen.getByText('appdb')).toBeInTheDocument();
        // host:port comes from the matched connection profile
        expect(screen.getByText(/localhost:5432/)).toBeInTheDocument();
    });

    it('shows a "not in the pool" hint when the bound connection is missing', () => {
        render(
            <EnvironmentMatrix
                connections={[]}
                getBinding={envKey =>
                    envKey === 'dev' ? { connectionRef: 'conn-gone', database: 'appdb' } : null
                }
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        expect(screen.getByText(/no longer in the pool/i)).toBeInTheDocument();
    });

    it('resolves the bound connection name from the pool by its id', () => {
        render(
            <EnvironmentMatrix
                connections={[
                    makeProfile({ id: 'conn-x', name: 'renamed-pg', host: 'db.internal' }),
                ]}
                getBinding={envKey =>
                    envKey === 'dev' ? { connectionRef: 'conn-x', database: 'appdb' } : null
                }
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        expect(screen.getByText('renamed-pg')).toBeInTheDocument();
        expect(screen.getByText(/db\.internal/)).toBeInTheDocument();
    });

    it("calls onUnbind when the chip's hover ✕ is clicked, without opening the picker", () => {
        const onUnbind = vi.fn();
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={envKey =>
                    envKey === 'dev' ? { connectionRef: 'conn-dev-pg', database: 'appdb' } : null
                }
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={onUnbind}
                onManageConnections={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByTitle('Unbind'));
        expect(onUnbind).toHaveBeenCalledWith('dev');
        expect(screen.queryByTestId('env-binding-picker')).not.toBeInTheDocument();
    });

    it('opens the picker, lists live databases per connection, and binds on click', async () => {
        const onBind = vi.fn();
        const onOpenEnv = vi.fn();
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={onOpenEnv}
                onBind={onBind}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        expect(onOpenEnv).toHaveBeenCalledWith('dev');
        await waitFor(() => expect(within(picker).getByText('appdb_staging')).toBeInTheDocument());

        fireEvent.click(within(picker).getByText('appdb_staging'));
        expect(onBind).toHaveBeenCalledWith(
            'dev',
            expect.objectContaining({ name: 'dev-pg' }),
            'appdb_staging',
        );
    });

    it('shows a single connection-level "Connected" dot (no per-database dots) once databases load', async () => {
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        await waitFor(() => expect(within(picker).getByText('appdb_staging')).toBeInTheDocument());
        // exactly one status dot — on the connection header, not on each db row
        expect(within(picker).getAllByLabelText('Connected')).toHaveLength(1);
    });

    it('surfaces the probe error text (and no fallback db rows) when a connection is unreachable', async () => {
        loadDatabasesForConnection.mockRejectedValue(new Error('ECONNREFUSED'));
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        await waitFor(() => expect(within(picker).getByText('ECONNREFUSED')).toBeInTheDocument());
        expect(within(picker).getByLabelText(/Unreachable — ECONNREFUSED/)).toBeInTheDocument();
        // the profile's own db_name is no longer offered as a fallback pick
        expect(within(picker).queryByRole('button', { name: 'appdb' })).not.toBeInTheDocument();
    });

    it('calls onManageConnections and closes the picker when "Manage connections" is clicked', async () => {
        const onManageConnections = vi.fn();
        render(
            <EnvironmentMatrix
                connections={[]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={onManageConnections}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        fireEvent.click(within(picker).getByRole('button', { name: /manage connections/i }));

        expect(onManageConnections).toHaveBeenCalled();
        expect(screen.queryByTestId('env-binding-picker')).not.toBeInTheDocument();
    });

    it('footer shows "Manage connections" on the left and "New connection" on the right, with or without a pool', async () => {
        const onCreateConnection = vi.fn();
        const { rerender } = render(
            <EnvironmentMatrix
                connections={[]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
                onCreateConnection={onCreateConnection}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        // Empty pool: the empty-state CTA plus the footer button.
        expect(
            within(picker).getAllByRole('button', { name: /New connection/i }).length,
        ).toBeGreaterThan(0);

        fireEvent.click(within(picker).getAllByRole('button', { name: /New connection/i })[0]);
        expect(onCreateConnection).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('env-binding-picker')).not.toBeInTheDocument();

        // Non-empty pool: still offered, ordered Manage → Add.
        rerender(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
                onCreateConnection={onCreateConnection}
            />,
        );
        const reopened = await openPicker('Bind connection & database');
        const manage = within(reopened).getByRole('button', { name: /manage connections/i });
        const add = within(reopened).getByRole('button', { name: /New connection/i });
        expect(manage.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(add);
        expect(onCreateConnection).toHaveBeenCalledTimes(2);
    });

    it('hides "New connection" when no create handler is provided', async () => {
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );
        const picker = await openPicker('Bind connection & database');
        expect(
            within(picker).queryByRole('button', { name: /New connection/i }),
        ).not.toBeInTheDocument();
        expect(
            within(picker).getByRole('button', { name: /manage connections/i }),
        ).toBeInTheDocument();
    });

    it('has no inline connection edit/delete/import affordances — CRUD lives in Settings', async () => {
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        expect(within(picker).queryByTitle('Edit connection')).not.toBeInTheDocument();
        expect(within(picker).queryByTitle('Delete connection')).not.toBeInTheDocument();
        expect(
            within(picker).queryByTitle('Import connections from a tool'),
        ).not.toBeInTheDocument();
        expect(
            within(picker).queryByTitle('Import connections from a file'),
        ).not.toBeInTheDocument();
        expect(within(picker).queryByTitle('Export connections')).not.toBeInTheDocument();
    });

    it('filters databases across connections by the search query', async () => {
        render(
            <EnvironmentMatrix
                connections={[makeProfile()]}
                getBinding={() => null}
                onOpenEnv={vi.fn()}
                onBind={vi.fn()}
                onUnbind={vi.fn()}
                onManageConnections={vi.fn()}
            />,
        );

        const picker = await openPicker('Bind connection & database');
        await waitFor(() => expect(within(picker).getByText('appdb_staging')).toBeInTheDocument());

        fireEvent.change(within(picker).getByPlaceholderText('Filter connection or database…'), {
            target: { value: 'staging' },
        });

        expect(within(picker).queryByText('appdb')).not.toBeInTheDocument();
        expect(within(picker).getByText('appdb_staging')).toBeInTheDocument();
    });
});
