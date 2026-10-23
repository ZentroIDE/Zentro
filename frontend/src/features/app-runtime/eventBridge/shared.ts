// SPDX-License-Identifier: GPL-3.0-only

import type { ToastApi, ToastNotifyOptions } from '../../../components/layout/Toast';

export type Unsubscribe = () => void;

export type ToastErrorFn = ToastApi['error'];

export interface EventBridgeToast {
    error: ToastErrorFn;
}

export function notifyImportantError(
    toastError: ToastErrorFn,
    message: string,
    options: ToastNotifyOptions,
): void {
    toastError(message, options);
}
