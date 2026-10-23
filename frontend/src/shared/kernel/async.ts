// SPDX-License-Identifier: GPL-3.0-only

import { fail, ok, type KernelResult } from './result';

/** Execute an async `runner` and return a `KernelResult`.
 *  Catches thrown errors and surfaces them as a structured
 *  `KernelError` with an error `code` and human-readable `message`.
 *  The optional `context` is merged into the error payload. */
export async function runSafe<T>(
    code: string,
    message: string,
    runner: () => Promise<T>,
    context?: Record<string, unknown>,
): Promise<KernelResult<T>> {
    try {
        return ok(await runner());
    } catch (error) {
        return fail({
            code,
            message,
            context: {
                ...context,
                cause: error instanceof Error ? error.message : String(error),
            },
        });
    }
}

/** Convenience wrapper for service-layer calls.
 *  Same as `runSafe` but without the context param — suitable
 *  for thin service functions that delegate to an adapter. */
export async function runServiceSafe<T>(
    code: string,
    message: string,
    runner: () => Promise<T>,
): Promise<KernelResult<T>> {
    return runSafe(code, message, runner);
}
