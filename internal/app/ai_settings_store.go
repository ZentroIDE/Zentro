// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"path/filepath"

	"zentro/internal/utils"
)

// ProjectAISettings is the per-project assistant switch. The API key is not
// stored here.
type ProjectAISettings struct {
	Enabled               bool     `json:"enabled"`
	AllowCloud            bool     `json:"allowCloud"`
	BaseURL               string   `json:"baseURL"`
	Model                 string   `json:"model"`
	AllowedHosts          []string `json:"allowedHosts"`
	DisabledConnectionIDs []string `json:"disabledConnectionIDs"`
	// IncludeBodies lets view, routine, and script text be read, by the chat
	// and by external agents alike.
	IncludeBodies bool `json:"includeBodies"`
	// IncludeConnectionDetails lets list_connections show the host, port, and
	// user name of each connection. Off, an agent sees names and drivers only.
	IncludeConnectionDetails bool `json:"includeConnectionDetails"`
	// AllowReadData, AllowChanges, and AllowAudit are the read_data, changes,
	// and audit permission groups (ai_permissions.go). Each is off by default.
	// read_data runs statements on real data but returns counts only
	// (estimate_impact, preview_cascade, dry_run); row values need DataMode.
	AllowReadData bool `json:"allowReadData"`
	// DataMode lets the assistant read row values: at most 10 rows per call,
	// asked per round for a cloud model or production (ADR 0017). Pro only,
	// off by default. Without it no row value reaches a model.
	DataMode     bool `json:"dataMode"`
	AllowChanges bool `json:"allowChanges"`
	AllowAudit   bool `json:"allowAudit"`
	// AutoApprove sends a chat question without the review step, for every
	// chat of this project. Off by default. A question that matches a
	// sensitive shape is still held, and every request shows in "Sent to".
	AutoApprove bool `json:"autoApprove"`
	// AllowProduction lets the changes group propose a write for production.
	// Reads follow the same rules there as anywhere (ADR 0017).
	AllowProduction bool `json:"allowProduction"`
	// Version is the settings layout this project was last saved with. A
	// project below aiSettingsVersion is migrated when the file is read.
	Version int `json:"version"`
	// DataPolicyNotice asks the assistant to tell the user, once, that it now
	// sees schema only (ADR 0017). Any settings save clears it.
	DataPolicyNotice bool `json:"dataPolicyNotice"`
	// KnownModels caches the model ids each host returned, keyed by host.
	// Model ids are not secrets, so they live beside the other settings.
	KnownModels map[string][]string `json:"knownModels"`
}

type aiSettingsFile struct {
	Projects map[string]ProjectAISettings `json:"projects"`
	MCP      aiMCPSettings                `json:"mcp"`
}

func defaultAISettingsPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	name := "zentro"
	if utils.Channel == "nightly" {
		name = "zentro-nightly"
	}
	dir := filepath.Join(base, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "ai-settings.json"), nil
}

func loadAISettings(path string) (aiSettingsFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return aiSettingsFile{Projects: map[string]ProjectAISettings{}}, nil
		}
		return aiSettingsFile{}, err
	}
	var file aiSettingsFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return aiSettingsFile{}, err
	}
	if file.Projects == nil {
		file.Projects = map[string]ProjectAISettings{}
	}
	for id, settings := range file.Projects {
		file.Projects[id] = migrateProjectAISettings(settings)
	}
	return file, nil
}

// aiSettingsVersion 2 is ADR 0017: the per-column classification rules are
// gone (the field no longer exists, so they drop on the next save), reading
// data starts off again, and row values need the new Data mode.
const aiSettingsVersion = 2

// migrateProjectAISettings brings one project's settings up to
// aiSettingsVersion. It changes nothing for a project already there.
func migrateProjectAISettings(settings ProjectAISettings) ProjectAISettings {
	if settings.Version >= aiSettingsVersion {
		return settings
	}
	settings.AllowReadData = false
	settings.DataMode = false
	// Only someone who had the assistant on has anything to be told.
	settings.DataPolicyNotice = settings.Enabled
	settings.Version = aiSettingsVersion
	return settings
}

func saveAISettings(path string, file aiSettingsFile) error {
	if file.Projects == nil {
		file.Projects = map[string]ProjectAISettings{}
	}
	// A save always writes the current layout, so settings sent back by the UI
	// (which does not know the version) are not migrated a second time.
	for id, settings := range file.Projects {
		settings.Version = aiSettingsVersion
		file.Projects[id] = settings
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}
