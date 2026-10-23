// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strconv"
	"strings"
	"zentro/internal/constant"
	"zentro/internal/models"
)

func init() {
	registerImporter(&dbeaverImporter{})
}

// dbeaverImporter implements ConnectionImporter for DBeaver.
type dbeaverImporter struct{}

func (d *dbeaverImporter) Key() string  { return "dbeaver" }
func (d *dbeaverImporter) Name() string { return "DBeaver" }

func (d *dbeaverImporter) DetectWorkspaces() []string {
	var found []string
	for _, candidate := range dbeaverCandidatePaths() {
		if _, err := os.Stat(candidate); err == nil {
			found = append(found, candidate)
		}
	}
	return found
}

func (d *dbeaverImporter) ParseConnections(path string) ([]models.ConnectionProfile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read DBeaver data sources: %w", err)
	}

	var ds dbeaverDataSources
	if err := json.Unmarshal(data, &ds); err != nil {
		return nil, fmt.Errorf("parse DBeaver data sources: %w", err)
	}

	profiles := make([]models.ConnectionProfile, 0, len(ds.Connections))
	for _, conn := range ds.Connections {
		name := strings.TrimSpace(conn.Name)
		if name == "" {
			continue
		}
		driver := dbeaverMapDriver(conn.Provider, conn.Driver)
		if driver == "" {
			continue // unsupported driver — skip silently
		}
		profile := models.NewConnectionProfile()
		profile.Name = name
		profile.Driver = driver
		profile.Host = firstNonEmptyStr(conn.Configuration.Host, "localhost")
		profile.Port = dbeaverParsePort(conn.Configuration.Port, driver)
		profile.DBName = firstNonEmptyStr(conn.Configuration.Database, conn.Configuration.Path)
		// Passwords are encrypted with a master key in DBeaver — never importable.
		profile.Password = ""
		profile.SavePassword = false
		profile.EncryptPassword = false
		profiles = append(profiles, *profile)
	}
	return profiles, nil
}

// dbeaverConnection is the shape of a single entry in DBeaver's data-sources.json.
type dbeaverConnection struct {
	Provider      string                  `json:"provider"`
	Driver        string                  `json:"driver"`
	Name          string                  `json:"name"`
	Configuration dbeaverConnectionConfig `json:"configuration"`
}

type dbeaverConnectionConfig struct {
	Host       string            `json:"host"`
	Port       string            `json:"port"`
	Database   string            `json:"database"`
	Path       string            `json:"path"` // SQLite file path
	Properties map[string]string `json:"properties"`
}

type dbeaverDataSources struct {
	Connections map[string]dbeaverConnection `json:"connections"`
}

// dbeaverMapDriver converts DBeaver provider/driver identifiers to Zentro driver names.
func dbeaverMapDriver(provider, driver string) string {
	p := strings.ToLower(provider)
	d := strings.ToLower(driver)
	switch {
	case strings.Contains(p, "postgresql") || strings.Contains(d, "postgresql") ||
		strings.Contains(d, "postgres") || strings.Contains(d, "greenplum") ||
		strings.Contains(d, "cockroach") || strings.Contains(d, "redshift") ||
		strings.Contains(d, "timescale"):
		return constant.DriverPostgres
	case strings.Contains(p, "mysql") || strings.Contains(d, "mysql") ||
		strings.Contains(d, "mariadb"):
		return constant.DriverMySQL
	case strings.Contains(p, "sqlserver") || strings.Contains(d, "sqlserver") ||
		strings.Contains(d, "jtds") || strings.Contains(p, "azure"):
		return constant.DriverSQLServer
	case strings.Contains(p, "sqlite") || strings.Contains(d, "sqlite"):
		return constant.DriverSQLite
	default:
		return ""
	}
}

func dbeaverParsePort(portStr, driver string) int {
	if portStr != "" {
		if p, err := strconv.Atoi(strings.TrimSpace(portStr)); err == nil && p > 0 {
			return p
		}
	}
	switch driver {
	case constant.DriverPostgres:
		return 5432
	case constant.DriverMySQL:
		return 3306
	case constant.DriverSQLServer:
		return 1433
	default:
		return 0
	}
}

// dbeaverCandidatePaths returns every data-sources.json it can find across all
// DBeaver workspace roots and all project subdirectories within each workspace.
// DBeaver stores one data-sources.json per project:
//
//	<DBeaverData>/workspace6/<project-name>/.dbeaver/data-sources.json
//
// Projects can be named anything (General, General-v2, MyWork, …).
func dbeaverCandidatePaths() []string {
	var paths []string
	for _, base := range dbeaverWorkspaceBases() {
		workspace6 := filepath.Join(base, "workspace6")

		// Scan every subdirectory of workspace6 — each one is a DBeaver project.
		entries, err := os.ReadDir(workspace6)
		if err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				paths = append(paths,
					filepath.Join(workspace6, e.Name(), ".dbeaver", "data-sources.json"),
				)
			}
		}

		// Older DBeaver versions keep connections at the workspace root.
		paths = append(paths, filepath.Join(workspace6, ".dbeaver", "data-sources.json"))
	}
	return paths
}

// dbeaverWorkspaceBases returns the OS-specific root directories under which
// DBeaver stores its data (the directory that contains "workspace6/").
func dbeaverWorkspaceBases() []string {
	var bases []string
	switch goruntime.GOOS {
	case "windows":
		if appData := os.Getenv("APPDATA"); appData != "" {
			bases = append(bases, filepath.Join(appData, "DBeaverData"))
		}
	case "darwin":
		if home, err := os.UserHomeDir(); err == nil {
			bases = append(bases, filepath.Join(home, "Library", "DBeaverData"))
		}
	default: // Linux / other UNIX
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			bases = append(bases, filepath.Join(xdg, "DBeaverData"))
		}
		if home, err := os.UserHomeDir(); err == nil {
			bases = append(bases,
				filepath.Join(home, ".local", "share", "DBeaverData"),
				filepath.Join(home, ".dbeaver"),
			)
		}
	}
	return bases
}
