// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ConnectionForm } from './ConnectionForm';
import { DRIVER } from '../../lib/constants';
import type { ConnectionProfile } from '../../types/connection';

function makeProps(overrides: Partial<React.ComponentProps<typeof ConnectionForm>> = {}) {
    return {
        formData: { driver: DRIVER.POSTGRES } as Partial<ConnectionProfile>,
        connString: '',
        testing: false,
        saving: false,
        testResult: 'idle' as const,
        errorMsg: '',
        successMsg: '',
        isEditing: false,
        onChange: vi.fn(),
        onConnStringChange: vi.fn(),
        onTest: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        ...overrides,
    };
}

describe('ConnectionForm', () => {
    it('shows Host/Port/Username/Password/Database fields and no radio toggle', () => {
        render(<ConnectionForm {...makeProps()} />);
        expect(screen.getByPlaceholderText('localhost')).toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });

    it('does not render a connection-string radio even for a server-based provider', () => {
        render(<ConnectionForm {...makeProps({ formData: { driver: DRIVER.SQLSERVER } })} />);
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(screen.queryByText('Connection string')).not.toBeInTheDocument();
    });

    it('pins Test / Cancel / Save and the status messages outside the scrolling fields', () => {
        render(<ConnectionForm {...makeProps({ errorMsg: 'boom', successMsg: 'ok' })} />);
        const scrollArea = screen.getByPlaceholderText('localhost').closest('.overflow-y-auto');
        expect(scrollArea).not.toBeNull();
        for (const node of [
            screen.getByRole('button', { name: /Test/ }),
            screen.getByRole('button', { name: 'Cancel' }),
            screen.getByRole('button', { name: 'Save' }),
            screen.getByText('boom'),
            screen.getByText('ok'),
        ]) {
            expect(scrollArea?.contains(node)).toBe(false);
        }
    });

    it('shows the top URI strip only when showUriField is set', () => {
        const { rerender } = render(<ConnectionForm {...makeProps()} />);
        expect(screen.queryByText('Connection string (URI)')).not.toBeInTheDocument();

        rerender(<ConnectionForm {...makeProps({ showUriField: true })} />);
        expect(screen.getByText('Connection string (URI)')).toBeInTheDocument();
    });

    it('always shows the Advanced section — SSL mode and toggles, no collapsing', () => {
        render(<ConnectionForm {...makeProps()} />);
        expect(screen.getByText('Advanced')).toBeInTheDocument();
        expect(screen.getByText('SSL mode')).toBeInTheDocument();
        expect(screen.getByText('Save password')).toBeInTheDocument();
        expect(screen.getByText('Encrypt password')).toBeInTheDocument();
        expect(screen.getByText('Show all schemas')).toBeInTheDocument();
        expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(3);
        expect(screen.queryByRole('button', { name: 'Advanced' })).not.toBeInTheDocument();
    });

    it('does not show SSL mode or Show all schemas for a hostless provider like SQLite', () => {
        render(<ConnectionForm {...makeProps({ formData: { driver: DRIVER.SQLITE } })} />);
        expect(screen.queryByText('SSL mode')).not.toBeInTheDocument();
        expect(screen.queryByText('Show all schemas')).not.toBeInTheDocument();
        expect(screen.getByText('Save password')).toBeInTheDocument();
    });

    it('shows the provider-specific extra toggle (Trust server cert) for SQL Server', () => {
        render(<ConnectionForm {...makeProps({ formData: { driver: DRIVER.SQLSERVER } })} />);
        expect(screen.getByText('Trust server cert')).toBeInTheDocument();
    });

    it('shows the TLS minimum version and legacy cipher controls for server providers only', () => {
        const { rerender } = render(<ConnectionForm {...makeProps()} />);
        expect(screen.getByText('TLS minimum version')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Legacy TLS ciphers' })).toBeInTheDocument();

        rerender(<ConnectionForm {...makeProps({ formData: { driver: DRIVER.SQLITE } })} />);
        expect(screen.queryByText('TLS minimum version')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('switch', { name: 'Legacy TLS ciphers' }),
        ).not.toBeInTheDocument();
    });

    it('toggling Legacy TLS ciphers reports tls_legacy_ciphers to onChange', () => {
        const onChange = vi.fn();
        render(<ConnectionForm {...makeProps({ onChange })} />);

        fireEvent.click(screen.getByRole('switch', { name: 'Legacy TLS ciphers' }));

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                target: expect.objectContaining({ name: 'tls_legacy_ciphers', checked: true }),
            }),
        );
    });

    it('hides the SSH fields until the tunnel is enabled, and never offers them for SQLite', () => {
        const { rerender } = render(<ConnectionForm {...makeProps()} />);
        expect(
            screen.getByRole('switch', { name: 'Connect through an SSH tunnel' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('ssh-tunnel-fields')).not.toBeInTheDocument();

        rerender(
            <ConnectionForm
                {...makeProps({ formData: { driver: DRIVER.POSTGRES, ssh_enabled: true } })}
            />,
        );
        expect(screen.getByTestId('ssh-tunnel-fields')).toBeInTheDocument();
        expect(screen.getByText('SSH host')).toBeInTheDocument();

        rerender(
            <ConnectionForm
                {...makeProps({ formData: { driver: DRIVER.SQLITE, ssh_enabled: true } })}
            />,
        );
        expect(screen.queryByTestId('ssh-tunnel-fields')).not.toBeInTheDocument();
    });

    it('shows the credential field that matches the SSH authentication method', () => {
        const base = { driver: DRIVER.POSTGRES, ssh_enabled: true };
        const { rerender } = render(
            <ConnectionForm {...makeProps({ formData: { ...base, ssh_auth: 'password' } })} />,
        );
        expect(screen.getByText('SSH password')).toBeInTheDocument();
        expect(screen.queryByText('Private key file')).not.toBeInTheDocument();

        rerender(<ConnectionForm {...makeProps({ formData: { ...base, ssh_auth: 'key' } })} />);
        expect(screen.getByText('Key passphrase')).toBeInTheDocument();
        expect(screen.queryByText('SSH password')).not.toBeInTheDocument();

        rerender(<ConnectionForm {...makeProps({ formData: { ...base, ssh_auth: 'agent' } })} />);
        expect(screen.queryByText('SSH password')).not.toBeInTheDocument();
        expect(screen.queryByText('Key passphrase')).not.toBeInTheDocument();
    });

    it('toggling the SSH tunnel reports ssh_enabled to onChange', () => {
        const onChange = vi.fn();
        render(<ConnectionForm {...makeProps({ onChange })} />);

        fireEvent.click(screen.getByRole('switch', { name: 'Connect through an SSH tunnel' }));

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                target: expect.objectContaining({ name: 'ssh_enabled', checked: true }),
            }),
        );
    });

    it('toggling Save password calls onChange with the field name and new value', () => {
        const onChange = vi.fn();
        render(<ConnectionForm {...makeProps({ onChange })} />);

        fireEvent.click(screen.getByRole('switch', { name: 'Save password' }));

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                target: expect.objectContaining({ name: 'save_password', checked: false }),
            }),
        );
    });

    it('disables Encrypt password when Save password is off', () => {
        render(
            <ConnectionForm
                {...makeProps({ formData: { driver: DRIVER.POSTGRES, save_password: false } })}
            />,
        );
        expect(screen.getByRole('switch', { name: 'Encrypt password' })).toBeDisabled();
    });

    it('does not render a provider logo watermark behind the form', () => {
        const { container } = render(<ConnectionForm {...makeProps()} />);
        expect(container.querySelector('[style*="background-image"]')).not.toBeInTheDocument();
    });
});
