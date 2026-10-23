// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { ImageColumnAdapter } from '../contracts/imageColumn';
import type { RestHttpClient } from './httpClient';

export function createImageColumnRestAdapter(client: RestHttpClient): ImageColumnAdapter {
    return withKernelResult('imageColumn', {
        getImageColumns: (connectionKey: string, tableKey: string) =>
            client.call<string[]>('/image-column/get-image-columns', { connectionKey, tableKey }),
        getImageColumnsByConnection: (connectionKey: string) =>
            client.call<Record<string, string[]>>('/image-column/get-image-columns-by-connection', {
                connectionKey,
            }),
        setImageColumn: (
            connectionKey: string,
            tableKey: string,
            column: string,
            marked: boolean,
        ) =>
            client.call<void>('/image-column/set-image-column', {
                connectionKey,
                tableKey,
                column,
                marked,
            }),
    });
}
