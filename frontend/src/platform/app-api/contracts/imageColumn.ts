// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

export interface ImageColumnAdapter {
    getImageColumns(connectionKey: string, tableKey: string): Promise<KernelResult<string[]>>;
    getImageColumnsByConnection(
        connectionKey: string,
    ): Promise<KernelResult<Record<string, string[]>>>;
    setImageColumn(
        connectionKey: string,
        tableKey: string,
        column: string,
        marked: boolean,
    ): Promise<KernelResult<void>>;
}
