// SPDX-License-Identifier: GPL-3.0-only

import { runSafe } from './async';
import type { KernelResult } from './result';

type AsyncMethod = (...args: never[]) => Promise<unknown>;

/** Maps each async method on T to return a KernelResult instead of a bare
 *  Promise; optional methods (`method?: ...`) stay optional. */
export type KernelResultAdapter<T> = {
    [K in keyof T]: T[K] extends ((...args: infer A) => Promise<infer R>) | undefined
        ? (...args: A) => Promise<KernelResult<R>>
        : T[K];
};

/** Wraps every method on an adapter object so it returns a KernelResult
 *  instead of a bare Promise, catching thrown/rejected errors into a
 *  structured KernelError scoped to `${domain}.${methodName}.failed`.
 *  Methods that are undefined (optional adapter methods not implemented by
 *  the current driver/tier) are left undefined rather than wrapped. This is
 *  the single seam apiGateway.ts's adapters go through instead of each
 *  domain hand-writing its own runSafe wiring per method. */
export function withKernelResult<T extends object>(
    domain: string,
    adapter: T,
): KernelResultAdapter<T> {
    const wrapped = {} as Record<string, unknown>;
    for (const key of Object.keys(adapter) as (keyof T & string)[]) {
        const method = adapter[key];
        if (typeof method !== 'function') continue;
        const fn = method as AsyncMethod;
        wrapped[key] = (...args: never[]) =>
            runSafe(`${domain}.${key}.failed`, `Failed to ${key}`, () => fn(...args));
    }
    return wrapped as KernelResultAdapter<T>;
}
