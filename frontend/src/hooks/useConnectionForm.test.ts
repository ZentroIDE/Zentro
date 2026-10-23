// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useConnectionForm } from './useConnectionForm';
import { DRIVER } from '../lib/constants';
import type { ConnectionProfile } from '../types/connection';

// Hoisted so it's a stable reference across re-renders — an inline object
// literal passed as `profile` would be a new reference every render, and
// since useConnectionForm's effect depends on `profile`, that reference
// churn drives an infinite render loop (and OOMs the test worker).
const EDITING_PROFILE: ConnectionProfile = {
    name: 'prod-mysql',
    driver: DRIVER.MYSQL,
    host: 'db.internal',
    port: 3306,
    db_name: 'app',
    username: 'root',
    password: '',
    connect_timeout: 10,
    save_password: true,
    encrypt_password: true,
    show_all_schemas: false,
    trust_server_cert: false,
};

vi.mock('../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            testConnection: vi.fn(),
            saveConnection: vi.fn(),
        },
    }),
}));

vi.mock('../../wailsjs/go/models', () => ({
    models: {
        ConnectionProfile: class {
            constructor(data: Record<string, unknown>) {
                Object.assign(this, data);
            }
        },
    },
}));

describe('useConnectionForm', () => {
    it('defaults a brand-new (non-editing) form to PostgreSQL on first render', () => {
        const { result } = renderHook(() => useConnectionForm({ isOpen: true }));
        expect(result.current.selectedProvider).toBe(DRIVER.POSTGRES);
    });

    it(
        're-defaults to PostgreSQL when isOpen flips from closed to open, not blank — ' +
            'regression test for the "New connection" flow briefly showing an unselected provider',
        () => {
            const { result, rerender } = renderHook(({ isOpen }) => useConnectionForm({ isOpen }), {
                initialProps: { isOpen: false },
            });

            rerender({ isOpen: true });

            expect(result.current.selectedProvider).toBe(DRIVER.POSTGRES);
        },
    );

    it('keeps the existing driver when editing a profile instead of forcing PostgreSQL', () => {
        const { result } = renderHook(() =>
            useConnectionForm({ isOpen: true, profile: EDITING_PROFILE }),
        );

        expect(result.current.selectedProvider).toBe(DRIVER.MYSQL);
    });

    it('resetForm() defaults back to PostgreSQL rather than a blank provider', () => {
        const { result } = renderHook(() => useConnectionForm({ isOpen: true }));

        act(() => result.current.handleDriverChange(DRIVER.MYSQL));
        expect(result.current.selectedProvider).toBe(DRIVER.MYSQL);

        act(() => result.current.resetForm());
        expect(result.current.selectedProvider).toBe(DRIVER.POSTGRES);
    });
});
