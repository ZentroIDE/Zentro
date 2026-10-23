// SPDX-License-Identifier: GPL-3.0-only

import { PickCSVFile, PreviewCSVImport, StartCSVImport } from '../../../wailsjs/go/app/App';
import type { app } from '../../../wailsjs/go/models';
import type { CSVImportOptions } from './contracts/import';

export const importAdapter = {
    PickCSVFile,
    PreviewCSVImport,
    // The generated app.CSVImportOptions class carries a convertValues
    // instance method (it has a nested ImportColumnMapping[] field) that a
    // plain options object never has — this adapter is the one place that
    // bridges our plain CSVImportOptions contract type to it; nothing about
    // the call is unsafe, since wailsjs's StartCSVImport only ever reads
    // the data fields at runtime (it JSON-serializes the argument, same as
    // every other Wails-bound call).
    StartCSVImport: (options: CSVImportOptions) => StartCSVImport(options as app.CSVImportOptions),
};
