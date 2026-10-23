// SPDX-License-Identifier: GPL-3.0-only

/** Kernel types and utilities for structured error-safe operations. */

export { ok, fail, kernelErrorMessage, unwrapOrThrow } from './result';
export type { KernelError, KernelResult } from './result';
export { runSafe, runServiceSafe } from './async';
export { withKernelResult } from './adapterEnvelope';
export type { KernelResultAdapter } from './adapterEnvelope';
