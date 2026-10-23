// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';

export type NotificationLevel = 'success' | 'info' | 'warning' | 'error';

export interface NotificationAction {
    id: string;
    label: string;
    run: () => void | Promise<void>;
}

export interface AppNotification {
    id: string;
    message: string;
    level: NotificationLevel;
    timestamp: number;
    source: string;
    important: boolean;
    read: boolean;
    dedupeKey?: string;
    actions?: NotificationAction[];
}

export interface NotificationInput {
    message: string;
    level: NotificationLevel;
    source?: string;
    important?: boolean;
    dedupeKey?: string;
    timestamp?: number;
    actions?: NotificationAction[];
}

const MAX_NOTIFICATIONS = 100;
const DEFAULT_SOURCE = 'ui.toast';

let sequence = 0;

function nextNotificationId(): string {
    sequence += 1;
    return `notification-${Date.now()}-${sequence}`;
}

function countUnread(entries: AppNotification[]): number {
    return entries.reduce((count, entry) => count + (entry.read ? 0 : 1), 0);
}

interface NotificationStoreState {
    entries: AppNotification[];
    unreadCount: number;
    notify: (input: NotificationInput) => void;
    markAllRead: () => void;
    clearAll: () => void;
}

export const useNotificationStore = create<NotificationStoreState>(set => ({
    entries: [],
    unreadCount: 0,
    notify: input => {
        if (!input.important) {
            return;
        }

        set(state => {
            const nextEntry: AppNotification = {
                id: nextNotificationId(),
                message: input.message,
                level: input.level,
                timestamp: input.timestamp ?? Date.now(),
                source: input.source || DEFAULT_SOURCE,
                important: true,
                read: false,
                dedupeKey: input.dedupeKey,
                actions: input.actions,
            };

            const nextEntries = input.dedupeKey
                ? state.entries.filter(entry => entry.dedupeKey !== input.dedupeKey)
                : [...state.entries];

            nextEntries.push(nextEntry);

            const trimmedEntries =
                nextEntries.length > MAX_NOTIFICATIONS
                    ? nextEntries.slice(nextEntries.length - MAX_NOTIFICATIONS)
                    : nextEntries;

            return {
                entries: trimmedEntries,
                unreadCount: countUnread(trimmedEntries),
            };
        });
    },
    markAllRead: () =>
        set(state => ({
            entries: state.entries.map(entry => (entry.read ? entry : { ...entry, read: true })),
            unreadCount: 0,
        })),
    clearAll: () => set({ entries: [], unreadCount: 0 }),
}));
