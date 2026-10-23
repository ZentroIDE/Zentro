// SPDX-License-Identifier: GPL-3.0-only

package models

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

type EnvironmentKey string

const (
	EnvironmentDevelopment EnvironmentKey = "dev"
	EnvironmentStaging     EnvironmentKey = "sta"
	EnvironmentProduction  EnvironmentKey = "pro"
)

var defaultEnvironmentLabels = map[EnvironmentKey]string{
	EnvironmentDevelopment: "Development",
	EnvironmentStaging:     "Staging",
	EnvironmentProduction:  "Production",
}

var defaultEnvironmentColors = map[EnvironmentKey]string{
	EnvironmentDevelopment: "blue",
	EnvironmentStaging:     "yellow",
	EnvironmentProduction:  "red",
}

type AssetType string

const (
	AssetSavedQuery     AssetType = "saved_query"
	AssetTemplate       AssetType = "template"
	AssetFavoriteObject AssetType = "favorite_object"
	AssetResultSnapshot AssetType = "result_snapshot"
)

type Project struct {
	ID                       string               `json:"id"`
	Slug                     string               `json:"slug"`
	Name                     string               `json:"name"`
	Description              string               `json:"description,omitempty"`
	Color                    string               `json:"color,omitempty"` // palette key from frontend PROJECT_COLOR_PALETTE
	StoragePath              string               `json:"storage_path,omitempty"`
	Tags                     []string             `json:"tags,omitempty"`
	CreatedAt                string               `json:"created_at"`
	UpdatedAt                string               `json:"updated_at"`
	LastOpenedAt             string               `json:"last_opened_at,omitempty"`
	DefaultEnvironmentKey    EnvironmentKey       `json:"default_environment_key"`
	LastActiveEnvironmentKey EnvironmentKey       `json:"last_active_environment_key,omitempty"`
	LayoutState              string               `json:"layout_state,omitempty"`
	Environments             []ProjectEnvironment `json:"environments,omitempty"`
	Connections              []ProjectConnection  `json:"connections,omitempty"`
	Assets                   []ProjectAsset       `json:"assets,omitempty"`
	AutoSchemaSnapshots      bool                 `json:"auto_schema_snapshots,omitempty"`
	AutoCommitOnExit         bool                 `json:"auto_commit_on_exit,omitempty"`
	CompletionMemory         *SQLCompletionMemory `json:"completion_memory,omitempty"`
}

type SQLCompletionMemory struct {
	Version int                        `json:"version"`
	Entries []SQLCompletionMemoryEntry `json:"entries"`
}

type SQLCompletionMemoryEntry struct {
	SuggestionKey  string `json:"suggestionKey"`
	SuggestionKind string `json:"suggestionKind"`
	ContextBucket  string `json:"contextBucket"`
	AcceptCount    int    `json:"acceptCount"`
	LastAcceptedAt int64  `json:"lastAcceptedAt"`
}

type ProjectEnvironment struct {
	ID          string         `json:"id"`
	ProjectID   string         `json:"project_id"`
	Key         EnvironmentKey `json:"key"`
	Label       string         `json:"label"`
	BadgeColor  string         `json:"badge_color,omitempty"`
	IsProtected bool           `json:"is_protected"`
	IsReadOnly  bool           `json:"is_read_only"`
	// ConnectionRef is the ID (not Name — Name is a freely renamable
	// display label) of a connection in the global pool (config.json >
	// connections). "" means this environment is not bound. Replaces the
	// old per-project embedded ProjectConnection model.
	ConnectionRef string `json:"connection_ref,omitempty"`
	// LastDatabase is the database this environment is bound to on
	// ConnectionRef's server. This environment is only actually bound
	// (connectable) once both ConnectionRef and LastDatabase are set — a
	// ConnectionRef with no LastDatabase means "pick a database", not
	// "use whatever the connection's own bootstrap database is".
	LastDatabase string `json:"last_database,omitempty"`
	LastSchema   string `json:"last_schema,omitempty"`
	LastCatalog  string `json:"last_catalog,omitempty"`
}

// ProjectConnection is the legacy per-project embedded connection shape.
// Connections are now a single global pool; this type is retained only so
// pre-migration project.json manifests still unmarshal and can be migrated
// into the pool (see utils.MigratePooledConnections).
type ProjectConnection struct {
	ID             string            `json:"id"`
	ProjectID      string            `json:"project_id"`
	EnvironmentKey EnvironmentKey    `json:"environment_key"`
	Name           string            `json:"name"`
	Driver         string            `json:"driver"`
	Version        string            `json:"version,omitempty"`
	Host           string            `json:"host,omitempty"`
	Port           int               `json:"port,omitempty"`
	Database       string            `json:"database,omitempty"`
	Username       string            `json:"username,omitempty"`
	Password       string            `json:"password,omitempty"`
	PasswordPolicy string            `json:"password_policy,omitempty"`
	SavePassword   bool              `json:"save_password"`
	SSLMode        string            `json:"ssl_mode,omitempty"`
	SocketPath     string            `json:"socket_path,omitempty"`
	UseSocket      bool              `json:"use_socket"`
	SSHEnabled     bool              `json:"ssh_enabled"`
	StatusColor    string            `json:"status_color,omitempty"`
	AdvancedMeta   map[string]string `json:"advanced_meta,omitempty"`
}

type ProjectAsset struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	Type        AssetType `json:"type"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	CreatedAt   string    `json:"created_at"`
	UpdatedAt   string    `json:"updated_at"`
}

type ExecutionContext struct {
	ProjectID      string `json:"project_id"`
	EnvironmentKey string `json:"environment_key"`
	ConnectionID   string `json:"connection_id"`
	Database       string `json:"database,omitempty"`
	Schema         string `json:"schema,omitempty"`
	TabID          string `json:"tab_id,omitempty"`
}

func DefaultEnvironmentKeys() []EnvironmentKey {
	return []EnvironmentKey{
		EnvironmentDevelopment,
		EnvironmentStaging,
		EnvironmentProduction,
	}
}

func DefaultEnvironmentLabel(key EnvironmentKey) string {
	if label, ok := defaultEnvironmentLabels[key]; ok {
		return label
	}
	return strings.ToUpper(string(key))
}

func DefaultEnvironmentColor(key EnvironmentKey) string {
	if color, ok := defaultEnvironmentColors[key]; ok {
		return color
	}
	return "gray"
}

func NewProject(name string) *Project {
	now := time.Now().UTC().Format(time.RFC3339)
	projectID := uuid.NewString()
	project := &Project{
		ID:                    projectID,
		Slug:                  Slugify(name),
		Name:                  strings.TrimSpace(name),
		CreatedAt:             now,
		UpdatedAt:             now,
		DefaultEnvironmentKey: EnvironmentDevelopment,
		AutoSchemaSnapshots:   true,
	}
	project.Environments = []ProjectEnvironment{
		NewProjectEnvironment(projectID, EnvironmentDevelopment),
	}
	return project
}

func NewProjectEnvironment(projectID string, key EnvironmentKey) ProjectEnvironment {
	return ProjectEnvironment{
		ID:          uuid.NewString(),
		ProjectID:   projectID,
		Key:         key,
		Label:       DefaultEnvironmentLabel(key),
		BadgeColor:  DefaultEnvironmentColor(key),
		IsProtected: key == EnvironmentProduction,
		IsReadOnly:  false,
	}
}

func Slugify(input string) string {
	input = strings.TrimSpace(strings.ToLower(input))
	if input == "" {
		return "project"
	}

	var b strings.Builder
	lastDash := false
	for _, r := range input {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}

	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "project"
	}
	return slug
}
