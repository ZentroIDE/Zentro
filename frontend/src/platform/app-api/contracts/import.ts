// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';

/** Mirrors internal/app/import_service.go's ImportColumnMapping. An empty
 *  targetColumn means the CSV column is skipped. */
export interface ImportColumnMapping {
    sourceColumn: string;
    targetColumn: string;
}

/** Mirrors internal/app/import_service.go's CSVImportOptions. */
export interface CSVImportOptions {
    filePath: string;
    /** "" (comma), ",", ";", "\t", "|", or any single character. */
    delimiter: string;
    hasHeader: boolean;
    schema: string;
    table: string;
    mappings: ImportColumnMapping[];
    nullToken: string;
    trimWhitespace: boolean;
    batchSize: number;
    /** "abort" (default) | "skip" */
    onError: 'abort' | 'skip' | '';
    singleTransaction: boolean;
    truncateFirst: boolean;
}

/** Mirrors internal/app/import_service.go's CSVImportPreview — the File and
 *  Mapping steps' data. inferredTypes[i] is a hint ("integer" | "numeric" |
 *  "boolean" | "text"), not a schema the import enforces. */
export interface CSVImportPreview {
    columns: string[];
    sampleRows: string[][];
    inferredTypes: string[];
    fileSizeBytes: number;
}

export interface ImportAdapter {
    /** Opens the OS-native file picker for a CSV file, resolving to "" if
     *  the user cancels. */
    pickCSVFile(): Promise<KernelResult<string>>;
    previewCSVImport(
        filePath: string,
        delimiter: string,
        hasHeader: boolean,
    ): Promise<KernelResult<CSVImportPreview>>;
    /** Starts the import as an Activity-panel job and returns its id. */
    startCSVImport(options: CSVImportOptions): Promise<KernelResult<string>>;
}
