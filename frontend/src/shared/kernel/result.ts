// SPDX-License-Identifier: GPL-3.0-only

/** Structured error carried by a failed KernelResult. */
export interface KernelError {
    code: string;
    message: string;
    retryable?: boolean;
    context?: Record<string, unknown>;
}

/** Discriminated union returned by every kernel service call.
 *  Access data via `result.ok` check before using `result.data`. */
export type KernelResult<T> = { ok: true; data: T } | { ok: false; error: KernelError };

/** Wrap a value as a successful KernelResult. */
export function ok<T>(data: T): KernelResult<T> {
    return { ok: true, data };
}

/** Wrap an error as a failed KernelResult. */
export function fail<T = never>(error: KernelError): KernelResult<T> {
    return { ok: false, error };
}

/** The most specific text available for a failed call: the original error
 *  message (KernelError.context.cause, set by runSafe/withKernelResult from
 *  the caught error) when there is one, else the generic "Failed to X"
 *  description. Toasts and other user-facing surfaces want this — a bare
 *  `error.message` reads as "Failed to connectProjectEnvironment" and hides
 *  what the backend actually said. */
export function kernelErrorMessage(error: KernelError): string {
    const cause = error.context?.cause;
    return typeof cause === 'string' && cause.trim() ? cause : error.message;
}

/** Unwrap a successful KernelResult's data, or throw an Error. Prefers the
 *  original error text (KernelError.context.cause, set by runSafe/
 *  withKernelResult from the caught error's message) over the generic
 *  "Failed to X" KernelError.message, since callers that string-match on
 *  error text (e.g. detecting "not a git repository") need the specific
 *  underlying message, not the generic wrapper description. Use at call
 *  sites that need failure to propagate as a rejection (e.g. a store action
 *  a caller drives with .then()/.catch() or try/catch) rather than a value
 *  the caller must remember to check. */
export function unwrapOrThrow<T>(result: KernelResult<T>): T {
    if (!result.ok) {
        throw new Error(kernelErrorMessage(result.error));
    }
    return result.data;
}
