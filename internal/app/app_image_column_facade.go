// SPDX-License-Identifier: GPL-3.0-only

package app

// Image column facade — thin delegates to ImageColumnService (image_column_service.go).

func (a *App) GetImageColumns(connectionKey, tableKey string) ([]string, error) {
	return a.svc.ImageColumns.GetImageColumns(connectionKey, tableKey)
}

func (a *App) GetImageColumnsByConnection(connectionKey string) (map[string][]string, error) {
	return a.svc.ImageColumns.GetImageColumnsByConnection(connectionKey)
}

func (a *App) SetImageColumn(connectionKey, tableKey, column string, marked bool) error {
	return a.svc.ImageColumns.SetImageColumn(connectionKey, tableKey, column, marked)
}
