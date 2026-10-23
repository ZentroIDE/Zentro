// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { DOM_EVENT, ENVIRONMENT_KEY } from '../../../lib/constants';
import { emitCommand } from '../../../lib/commandBus';
import { QuickEnvPopover } from './QuickEnvPopover';

const projectState = {
    activeProject: {
        id: 'project-1',
        default_environment_key: ENVIRONMENT_KEY.PRODUCTION,
        environments: [
            {
                key: ENVIRONMENT_KEY.PRODUCTION,
                connection_ref: 'conn-prod',
                last_database: 'ledger',
                last_schema: 'public',
            },
            {
                key: 'sta',
                connection_ref: 'conn-staging',
                last_database: 'ledger_staging',
                last_schema: 'public',
            },
        ],
    },
    setProjectEnvironment: vi.fn(async () => true),
};

const environmentState = {
    activeEnvironmentKey: ENVIRONMENT_KEY.PRODUCTION,
    setActiveEnvironment: vi.fn(),
    setIsSwitching: vi.fn(),
};

const connectionState = {
    activeProfile: {
        host: 'prod-db.internal',
        port: 5432,
        name: 'prod-primary',
        db_name: 'ledger',
    },
    connections: [
        {
            id: 'conn-prod',
            name: 'prod-primary',
            driver: 'postgres',
            host: 'prod-db.internal',
            port: 5432,
        },
        {
            id: 'conn-staging',
            name: 'staging-primary',
            driver: 'mysql',
            host: 'staging-db.internal',
            port: 3306,
        },
    ],
};

const toastState = {
    toast: {
        error: vi.fn(),
    },
};

vi.mock('../../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
}));

vi.mock('../../../stores/environmentStore', () => ({
    useEnvironmentStore: (selector: (state: typeof environmentState) => unknown) =>
        selector(environmentState),
}));

vi.mock('../../../stores/connectionStore', () => ({
    useConnectionStore: (selector: (state: typeof connectionState) => unknown) =>
        selector(connectionState),
}));

vi.mock('../Toast', () => ({
    useToast: () => toastState,
}));

describe('QuickEnvPopover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.PRODUCTION;
    });

    it('shows the active environment with the truncated (abbreviated) label', () => {
        render(<QuickEnvPopover />);

        expect(screen.getByText('PROD')).toBeInTheDocument();
        expect(screen.queryByText('Production')).not.toBeInTheDocument();
    });

    it('shows truncated labels in the quick switch popover', async () => {
        render(<QuickEnvPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Current environment: Production/i));

        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('PROD')).toBeInTheDocument();
        expect(within(popover).getByText('STAG')).toBeInTheDocument();
    });

    it('shows the connection name, database, and host:port per row', async () => {
        render(<QuickEnvPopover />);

        fireEvent.mouseEnter(screen.getByTitle(/Current environment: Production/i));

        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('prod-primary')).toBeInTheDocument();
        expect(within(popover).getByText('ledger')).toBeInTheDocument();
        expect(within(popover).getByText('prod-db.internal:5432')).toBeInTheDocument();
        expect(within(popover).getByText('staging-primary')).toBeInTheDocument();
        expect(within(popover).getByText('staging-db.internal:3306')).toBeInTheDocument();
    });

    it('opens the popover when the QUICK_SWITCH_ENVIRONMENT command fires (Ctrl+P)', async () => {
        render(<QuickEnvPopover />);

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_ENVIRONMENT);
        });

        const popover = await screen.findByRole('dialog');
        expect(within(popover).getByText('PROD')).toBeInTheDocument();
    });

    it('toggles the popover closed on a second QUICK_SWITCH_ENVIRONMENT command', async () => {
        render(<QuickEnvPopover />);

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_ENVIRONMENT);
        });
        await screen.findByRole('dialog');

        act(() => {
            emitCommand(DOM_EVENT.QUICK_SWITCH_ENVIRONMENT);
        });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
