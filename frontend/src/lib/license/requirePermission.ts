// SPDX-License-Identifier: GPL-3.0-only

import { fail, type KernelResult } from '../../shared/kernel/result';
import { FeatureGate } from './featureGate';
import { checkPermission, type Permission } from './permissions';
import { createLicenseState } from './types';

let _gate: FeatureGate | null = null;

export function setPermissionGate(gate: FeatureGate): void {
    _gate = gate;
}

export function resetPermissionGate(): void {
    _gate = null;
}

function getGate(): FeatureGate {
    if (!_gate) {
        _gate = new FeatureGate(createLicenseState());
    }
    return _gate;
}

export function requirePermission<T>(permission: Permission, code: string, message: string) {
    return function (
        fn: (...args: unknown[]) => Promise<KernelResult<T>>,
    ): (...args: unknown[]) => Promise<KernelResult<T>> {
        return async (...args: unknown[]): Promise<KernelResult<T>> => {
            const check = checkPermission(getGate(), permission);
            if (!check.allowed) {
                return fail({
                    code,
                    message: check.reason || message,
                    context: { permission, featureId: check.featureId },
                });
            }
            return fn(...args);
        };
    };
}
