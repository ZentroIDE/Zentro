// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

// ConnectionImporter is the port that every external-tool adapter must satisfy.
// To add support for a new tool (e.g. DataGrip, Beekeeper Studio):
//  1. Create a new file `connection_importer_<tool>.go` in this package.
//  2. Implement the four methods below on a private struct.
//  3. Call registerImporter(&yourStruct{}) inside an init() function in that file.
//
// No changes to the Wails facade or the frontend are needed.
type ConnectionImporter interface {
	// Key is the stable identifier sent over the wire (e.g. "dbeaver").
	Key() string
	// Name is the human-readable display name (e.g. "DBeaver").
	Name() string
	// DetectWorkspaces scans OS-standard paths and returns every data-source
	// file that exists. Multiple files arise when the tool has several projects.
	DetectWorkspaces() []string
	// ParseConnections reads the file at path and maps its entries to Zentro
	// ConnectionProfile values. Passwords must never be included.
	ParseConnections(path string) ([]models.ConnectionProfile, error)
}

// ImporterInfo is serialised to the frontend so it can render the tool list.
type ImporterInfo struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

var connectionImporters []ConnectionImporter

// registerImporter adds imp to the ordered importer registry.
// Call this from an init() function in each tool-specific file.
func registerImporter(imp ConnectionImporter) {
	connectionImporters = append(connectionImporters, imp)
}

// findImporter looks up a registered importer by key.
func findImporter(key string) (ConnectionImporter, bool) {
	for _, imp := range connectionImporters {
		if imp.Key() == key {
			return imp, true
		}
	}
	return nil, false
}
