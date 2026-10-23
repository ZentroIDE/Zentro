// SPDX-License-Identifier: GPL-3.0-only

package app

// Export facade — result-set exports run as Activity-panel jobs (see
// export_service.go). Each method's return value is a Job id (see
// job_service.go), not a file path any more — "" with a nil error means
// the user cancelled the save dialog before any job was created, the same
// signal the previous file-path-based contract used for a cancelled
// dialog, so the frontend's existing cancellation check didn't need to
// change.

func (a *App) ExportCSV(columns []string, rows [][]string) (string, error) {
	return a.svc.Query.StartExportCSV(columns, rows)
}

func (a *App) ExportJSON(columns []string, rows [][]string) (string, error) {
	return a.svc.Query.StartExportJSON(columns, rows)
}

func (a *App) ExportSQLInsert(columns []string, rows [][]string, tableName string) (string, error) {
	return a.svc.Query.StartExportSQLInsert(columns, rows, tableName)
}

// knownTotal is the row count the frontend already has cached from the
// result panel's own background COUNT(*) (query:count event) — 0 when it
// doesn't have one yet, which leaves the job's progress indeterminate.
func (a *App) ExportAllCSV(tabID string, selectedColumns []string, knownTotal int64) (string, error) {
	return a.svc.Query.StartExportAllCSV(tabID, selectedColumns, knownTotal)
}

func (a *App) ExportAllJSON(tabID string, selectedColumns []string, knownTotal int64) (string, error) {
	return a.svc.Query.StartExportAllJSON(tabID, selectedColumns, knownTotal)
}

func (a *App) ExportAllSQLInsert(tabID, tableName string, selectedColumns []string, knownTotal int64) (string, error) {
	return a.svc.Query.StartExportAllSQLInsert(tabID, tableName, selectedColumns, knownTotal)
}
