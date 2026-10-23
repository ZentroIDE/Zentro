// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { CSVImportOptions, CSVImportPreview, ImportAdapter } from '../contracts/import';
import type { RestHttpClient } from './httpClient';

export function createImportRestAdapter(client: RestHttpClient): ImportAdapter {
    return withKernelResult('dataImport', {
        pickCSVFile: () => client.call<string>('/import/pick-csv-file', {}),
        previewCSVImport: (filePath: string, delimiter: string, hasHeader: boolean) =>
            client.call<CSVImportPreview>('/import/preview-csv', {
                filePath,
                delimiter,
                hasHeader,
            }),
        startCSVImport: (options: CSVImportOptions) =>
            client.call<string>('/import/start-csv', { options }),
    });
}
