// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) openJSONFileDialog(title string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
}

func (a *App) saveJSONFileDialog(title string, defaultFilename string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
}

func (a *App) saveDialogByExt(title, defaultFilename, displayName, pattern string) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultFilename,
		Filters:         []runtime.FileFilter{{DisplayName: displayName, Pattern: pattern}},
	})
}

func (a *App) openDirectoryDialog(title string, defaultDir string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: defaultDir,
	})
}

// openSQLiteFileDialog shows the OS-native "open file" dialog (Explorer on
// Windows, Finder on macOS, the desktop portal on Linux — Wails picks the
// native one per platform) filtered to common SQLite file extensions.
func (a *App) openSQLiteFileDialog(title string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: "SQLite Database (*.db;*.sqlite;*.sqlite3;*.db3)", Pattern: "*.db;*.sqlite;*.sqlite3;*.db3"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
}

// openCSVFileDialog shows the OS-native "open file" dialog filtered to CSV
// files, for the data-import wizard (import_service.go).
func (a *App) openCSVFileDialog(title string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{DisplayName: "CSV Files (*.csv)", Pattern: "*.csv"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
}
