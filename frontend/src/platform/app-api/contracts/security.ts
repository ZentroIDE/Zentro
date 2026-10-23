// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';
import type { ProSecurityState } from '../types';

export interface SecurityAdapter {
    getProSecurityState?(): Promise<KernelResult<ProSecurityState>>;
    configureAppLock?(
        enabled: boolean,
        timeoutSec: number,
        pin: string,
    ): Promise<KernelResult<ProSecurityState>>;
    lockApp?(): Promise<KernelResult<ProSecurityState>>;
    unlockApp?(pin: string): Promise<KernelResult<ProSecurityState>>;
    unlockAppWithOS?(): Promise<KernelResult<ProSecurityState>>;
    configureSecretVault?(
        enabled: boolean,
        password: string,
    ): Promise<KernelResult<ProSecurityState>>;
    unlockSecretVault?(password: string): Promise<KernelResult<ProSecurityState>>;
    lockSecretVault?(): Promise<KernelResult<ProSecurityState>>;
}
