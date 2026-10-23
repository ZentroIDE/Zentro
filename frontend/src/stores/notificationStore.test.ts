// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from './notificationStore';

describe('useNotificationStore', () => {
    beforeEach(() => {
        useNotificationStore.setState({ entries: [], unreadCount: 0 });
    });

    it('appends important notifications', () => {
        useNotificationStore.getState().notify({
            message: 'Connection lost',
            level: 'error',
            important: true,
            source: 'system.connection',
        });

        const state = useNotificationStore.getState();
        expect(state.entries).toHaveLength(1);
        expect(state.entries[0]).toMatchObject({
            message: 'Connection lost',
            level: 'error',
            important: true,
            read: false,
            source: 'system.connection',
        });
        expect(state.unreadCount).toBe(1);
    });

    it('ignores non-important notifications', () => {
        useNotificationStore.getState().notify({
            message: 'Saved',
            level: 'success',
            important: false,
        });

        expect(useNotificationStore.getState().entries).toHaveLength(0);
        expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('marks all notifications as read', () => {
        useNotificationStore.getState().notify({
            message: 'Query failed',
            level: 'error',
            important: true,
        });

        useNotificationStore.getState().markAllRead();

        const state = useNotificationStore.getState();
        expect(state.entries[0].read).toBe(true);
        expect(state.unreadCount).toBe(0);
    });

    it('clears all notifications', () => {
        useNotificationStore.getState().notify({
            message: 'Query failed',
            level: 'error',
            important: true,
        });

        useNotificationStore.getState().clearAll();

        expect(useNotificationStore.getState().entries).toHaveLength(0);
        expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('caps notifications at 100 entries', () => {
        for (let index = 0; index < 105; index += 1) {
            useNotificationStore.getState().notify({
                message: `Message ${index}`,
                level: 'error',
                important: true,
                dedupeKey: `key-${index}`,
            });
        }

        const state = useNotificationStore.getState();
        expect(state.entries).toHaveLength(100);
        expect(state.entries[0].message).toBe('Message 5');
        expect(state.unreadCount).toBe(100);
    });

    it('dedupes by stable key and keeps only the latest entry', () => {
        useNotificationStore.getState().notify({
            message: 'First failure',
            level: 'error',
            important: true,
            dedupeKey: 'connection-error',
        });
        useNotificationStore.getState().markAllRead();

        useNotificationStore.getState().notify({
            message: 'Latest failure',
            level: 'error',
            important: true,
            dedupeKey: 'connection-error',
        });

        const state = useNotificationStore.getState();
        expect(state.entries).toHaveLength(1);
        expect(state.entries[0].message).toBe('Latest failure');
        expect(state.entries[0].read).toBe(false);
        expect(state.unreadCount).toBe(1);
    });

    it('keeps actions on stored notifications', () => {
        const openFile = () => undefined;
        useNotificationStore.getState().notify({
            message: 'Exported',
            level: 'success',
            important: true,
            actions: [
                {
                    id: 'open-file',
                    label: 'Open file',
                    run: openFile,
                },
            ],
        });

        expect(useNotificationStore.getState().entries[0].actions?.[0]).toMatchObject({
            id: 'open-file',
            label: 'Open file',
            run: openFile,
        });
    });
});
