// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"
	"zentro/internal/models"
)

// ListConnectionImporters returns metadata for all registered importers.
// The frontend uses this to render the tool-picker list.
func (a *App) ListConnectionImporters() []ImporterInfo {
	out := make([]ImporterInfo, 0, len(connectionImporters))
	for _, imp := range connectionImporters {
		out = append(out, ImporterInfo{Key: imp.Key(), Name: imp.Name()})
	}
	return out
}

// DetectImporterWorkspace returns the first data-source file found for the named
// tool, or an empty string. Useful for display/info purposes on the frontend.
func (a *App) DetectImporterWorkspace(key string) string {
	imp, ok := findImporter(key)
	if !ok {
		return ""
	}
	ws := imp.DetectWorkspaces()
	if len(ws) == 0 {
		return ""
	}
	return ws[0]
}

// ImportConnectionsFromTool imports connections using the named importer.
// When path is empty all workspaces are auto-detected; connections from every
// project are merged and deduplicated by name (last-write wins per project order).
// Returns nil, nil when no workspace is found at any standard path.
// Pass an explicit path to import from a single specific file.
func (a *App) ImportConnectionsFromTool(key, path string) ([]models.ConnectionProfile, error) {
	imp, ok := findImporter(key)
	if !ok {
		return nil, fmt.Errorf("unknown connection importer: %q", key)
	}

	var paths []string
	if resolved := strings.TrimSpace(path); resolved != "" {
		paths = []string{resolved}
	} else {
		paths = imp.DetectWorkspaces()
	}
	if len(paths) == 0 {
		return nil, nil // no workspace found at any standard path
	}

	seen := make(map[string]bool)
	var all []models.ConnectionProfile
	for _, p := range paths {
		profiles, err := imp.ParseConnections(p)
		if err != nil {
			continue // skip unreadable/malformed files
		}
		for _, profile := range profiles {
			if !seen[profile.Name] {
				seen[profile.Name] = true
				all = append(all, profile)
			}
		}
	}
	return carryOverPooledCredentials(all), nil
}

// firstNonEmptyStr returns the first non-blank string from values.
func firstNonEmptyStr(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
