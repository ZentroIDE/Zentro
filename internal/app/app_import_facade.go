// SPDX-License-Identifier: GPL-3.0-only

package app

// CSV import facade (import_service.go).

// PickCSVFile opens the OS-native file picker for choosing a CSV file to
// import, resolving to "" if the user cancels.
func (a *App) PickCSVFile() (string, error) {
	return a.openCSVFileDialog("Select CSV file to import")
}

// PreviewCSVImport reads a sample of filePath for the import wizard's File
// and Mapping steps. Read-only — never touches a database connection.
func (a *App) PreviewCSVImport(filePath, delimiter string, hasHeader bool) (CSVImportPreview, error) {
	return previewCSVImport(filePath, delimiter, hasHeader)
}

// StartCSVImport starts streaming opts.FilePath into opts.Schema.opts.Table
// as an Activity-panel job, returning the job id.
func (a *App) StartCSVImport(opts CSVImportOptions) (string, error) {
	if err := a.ensureWritable("import csv"); err != nil {
		return "", err
	}
	return a.svc.Query.StartCSVImport(opts)
}
