// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"zentro/internal/models"
	"zentro/internal/utils"
)

// ConnectionBundle is the export/import file format for the global connection
// pool: a versioned list of connections with every secret stripped.
type ConnectionBundle struct {
	Version     string                     `json:"version"`
	Connections []models.ConnectionProfile `json:"connections"`
}

// legacyConnectionPackage is the pre-pool single-connection export shape
// (`{"version": "...", "connection": {...}}`), still accepted on import.
type legacyConnectionPackage struct {
	Version    string                   `json:"version"`
	Connection models.ConnectionProfile `json:"connection"`
}

// sanitizeExportProfile removes secrets and machine-local password flags so a
// bundle file never carries credentials.
func sanitizeExportProfile(p models.ConnectionProfile) models.ConnectionProfile {
	p.Password = ""
	p.SSHPassword = ""
	p.SSHPassphrase = ""
	p.SavePassword = false
	p.EncryptPassword = false
	return p
}

// buildConnectionBundle collects pool connections — all when names is empty,
// otherwise the named subset (pool order preserved) — with secrets stripped.
func buildConnectionBundle(pool []*models.ConnectionProfile, names []string) ConnectionBundle {
	want := make(map[string]bool, len(names))
	for _, n := range names {
		if trimmed := strings.TrimSpace(n); trimmed != "" {
			want[trimmed] = true
		}
	}
	out := make([]models.ConnectionProfile, 0, len(pool))
	for _, profile := range pool {
		if profile == nil {
			continue
		}
		if len(want) > 0 && !want[profile.Name] {
			continue
		}
		out = append(out, sanitizeExportProfile(*profile))
	}
	return ConnectionBundle{Version: "v1", Connections: out}
}

// ExportConnectionsBundle writes selected pool connections (all when names is
// empty) to a user-picked JSON file. Passwords are never included. Returns the
// written path, or "" when the user cancels the save dialog.
func (a *App) ExportConnectionsBundle(names []string) (string, error) {
	pool, err := utils.LoadConnections()
	if err != nil {
		return "", err
	}
	bundle := buildConnectionBundle(pool, names)
	if len(bundle.Connections) == 0 {
		return "", fmt.Errorf("no connections to export")
	}

	filePath, err := a.saveJSONFileDialog("Export Connections", "zentro-connections.json")
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil
	}
	if filepath.Ext(filePath) == "" {
		filePath += ".json"
	}

	content, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filePath, content, 0o644); err != nil {
		return "", err
	}
	return filePath, nil
}

// parseConnectionBundleFile reads a Zentro connections bundle (or a legacy
// single-connection package) and returns its profiles with secrets blanked.
func parseConnectionBundleFile(path string) ([]models.ConnectionProfile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read connections file: %w", err)
	}

	var bundle ConnectionBundle
	if err := json.Unmarshal(data, &bundle); err == nil && len(bundle.Connections) > 0 {
		out := make([]models.ConnectionProfile, 0, len(bundle.Connections))
		for _, profile := range bundle.Connections {
			if strings.TrimSpace(profile.Name) == "" {
				continue
			}
			out = append(out, sanitizeExportProfile(profile))
		}
		return out, nil
	}

	var pkg legacyConnectionPackage
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("invalid connections file: %w", err)
	}
	if strings.TrimSpace(pkg.Connection.Name) == "" {
		return nil, fmt.Errorf("connections file has no usable connection")
	}
	return []models.ConnectionProfile{sanitizeExportProfile(pkg.Connection)}, nil
}

// carryOverPooledCredentials re-attaches the credentials the pool already
// holds to imported profiles that reuse an existing connection's name.
// Import sources are credential-free by design (a bundle never carries a
// password, DBeaver's are unreadable), so without this an import that lands
// on an existing name would save a blank password over a working one and
// leave every environment bound to it failing to authenticate.
func carryOverPooledCredentials(imported []models.ConnectionProfile) []models.ConnectionProfile {
	if len(imported) == 0 {
		return imported
	}
	pool, err := utils.LoadConnections()
	if err != nil || len(pool) == 0 {
		return imported
	}
	byName := make(map[string]*models.ConnectionProfile, len(pool))
	for _, profile := range pool {
		if profile != nil {
			byName[profile.Name] = profile
		}
	}
	for i := range imported {
		if strings.TrimSpace(imported[i].Password) != "" {
			continue
		}
		existing, ok := byName[imported[i].Name]
		if !ok || strings.TrimSpace(existing.Password) == "" {
			continue
		}
		imported[i].Password = existing.Password
		imported[i].SavePassword = existing.SavePassword
		imported[i].EncryptPassword = existing.EncryptPassword
	}
	return imported
}

// ImportConnectionsFromFile prompts for a JSON file and returns the connections
// it contains (bundle or legacy single-connection package) with secrets
// stripped. Returns (nil, nil) when the user cancels the open dialog. The
// frontend persists the user-selected subset via SaveConnection.
func (a *App) ImportConnectionsFromFile() ([]models.ConnectionProfile, error) {
	filePath, err := a.openJSONFileDialog("Import Connections")
	if err != nil {
		return nil, err
	}
	if filePath == "" {
		return nil, nil
	}
	imported, err := parseConnectionBundleFile(filePath)
	if err != nil {
		return nil, err
	}
	return carryOverPooledCredentials(imported), nil
}
