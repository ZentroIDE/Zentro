// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatusBarNotifications } from './StatusBarNotifications';
import { useNotificationStore } from '../../stores/notificationStore';

describe('StatusBarNotifications', () => {
    beforeEach(() => {
        useNotificationStore.setState({ entries: [], unreadCount: 0 });
    });

    it('renders unread badge for important notifications', () => {
        useNotificationStore.getState().notify({
            message: 'Connection lost',
            level: 'error',
            important: true,
            source: 'system.connection',
        });

        render(<StatusBarNotifications />);

        const trigger = screen.getByLabelText('Notifications (1 unread)');
        expect(trigger).toBeInTheDocument();
        expect(trigger.querySelector('span[aria-hidden="true"]')).toBeTruthy();
    });

    it('opens the popover and marks notifications as read', () => {
        useNotificationStore.getState().notify({
            message: 'Query failed',
            level: 'error',
            important: true,
            source: 'system.query',
        });

        render(<StatusBarNotifications />);

        fireEvent.click(screen.getByLabelText('Notifications (1 unread)'));

        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('Query failed')).toBeInTheDocument();
        expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('shows an empty state after clearing all notifications', () => {
        useNotificationStore.getState().notify({
            message: 'Startup failed',
            level: 'error',
            important: true,
            source: 'startup.auto-open',
        });

        render(<StatusBarNotifications />);

        fireEvent.click(screen.getByLabelText('Notifications (1 unread)'));
        fireEvent.click(screen.getByRole('button', { name: 'Clear all notifications' }));

        expect(screen.getByText('No important notifications yet.')).toBeInTheDocument();
        expect(useNotificationStore.getState().entries).toHaveLength(0);
    });

    it('runs notification actions from the inbox', () => {
        const openFile = vi.fn();
        useNotificationStore.getState().notify({
            message: 'Exported to query_result.csv',
            level: 'success',
            important: true,
            source: 'result.export',
            actions: [
                {
                    id: 'open-file',
                    label: 'Open file',
                    run: openFile,
                },
            ],
        });

        render(<StatusBarNotifications />);

        fireEvent.click(screen.getByLabelText('Notifications (1 unread)'));
        fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

        expect(openFile).toHaveBeenCalledTimes(1);
    });
});
