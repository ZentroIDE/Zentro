// SPDX-License-Identifier: GPL-3.0-only

import {
    useNotificationStore,
    type NotificationAction,
    type NotificationInput,
} from '../stores/notificationStore';

export interface NotificationOptions {
    source?: string;
    important?: boolean;
    dedupeKey?: string;
    actions?: NotificationAction[];
}

export function recordNotification(
    level: NotificationInput['level'],
    message: string,
    options?: NotificationOptions,
): void {
    useNotificationStore.getState().notify({
        message,
        level,
        source: options?.source,
        important: options?.important,
        dedupeKey: options?.dedupeKey,
        actions: options?.actions,
    });
}
