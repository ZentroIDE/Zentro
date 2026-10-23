// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"

	"zentro/internal/models"
)

// legacyEnvironmentKeyRemap maps environment keys removed from the product
// (Local, Testing) to their successor, so project.json files written before
// the removal keep loading instead of showing an unknown/gray badge.
var legacyEnvironmentKeyRemap = map[models.EnvironmentKey]models.EnvironmentKey{
	"loc": models.EnvironmentDevelopment,
	"tes": models.EnvironmentDevelopment,
}

func remapLegacyEnvironmentKey(key models.EnvironmentKey) models.EnvironmentKey {
	if remapped, ok := legacyEnvironmentKeyRemap[key]; ok {
		return remapped
	}
	return key
}

func normalizeProject(project *models.Project) {
	if project == nil {
		return
	}

	project.DefaultEnvironmentKey = remapLegacyEnvironmentKey(project.DefaultEnvironmentKey)
	project.LastActiveEnvironmentKey = remapLegacyEnvironmentKey(project.LastActiveEnvironmentKey)
	for i := range project.Environments {
		project.Environments[i].Key = remapLegacyEnvironmentKey(project.Environments[i].Key)
	}
	for i := range project.Connections {
		project.Connections[i].EnvironmentKey = remapLegacyEnvironmentKey(project.Connections[i].EnvironmentKey)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if project.ID == "" {
		project.ID = models.NewProject(project.Name).ID
	}
	if project.Slug == "" {
		project.Slug = models.Slugify(project.Name)
	}
	if project.CreatedAt == "" {
		project.CreatedAt = now
	}
	if project.UpdatedAt == "" {
		project.UpdatedAt = now
	}
	project.StoragePath = strings.TrimSpace(project.StoragePath)
	if project.DefaultEnvironmentKey == "" {
		project.DefaultEnvironmentKey = models.EnvironmentDevelopment
	}
	if project.LastActiveEnvironmentKey == "" {
		project.LastActiveEnvironmentKey = project.DefaultEnvironmentKey
	}
	if project.Tags == nil {
		project.Tags = []string{}
	}

	if len(project.Environments) == 0 {
		project.Environments = []models.ProjectEnvironment{
			models.NewProjectEnvironment(project.ID, project.DefaultEnvironmentKey),
		}
	}
	for i := range project.Environments {
		env := &project.Environments[i]
		if env.ID == "" {
			env.ID = models.NewProjectEnvironment(project.ID, env.Key).ID
		}
		env.ProjectID = project.ID
		if env.Key == "" {
			env.Key = project.DefaultEnvironmentKey
		}
		if env.Label == "" {
			env.Label = models.DefaultEnvironmentLabel(env.Key)
		}
		if env.BadgeColor == "" {
			env.BadgeColor = models.DefaultEnvironmentColor(env.Key)
		}
		if env.Key == models.EnvironmentProduction {
			env.IsProtected = true
		}
	}

	lastActiveExists := false
	for _, env := range project.Environments {
		if env.Key == project.LastActiveEnvironmentKey {
			lastActiveExists = true
			break
		}
	}
	if !lastActiveExists {
		project.LastActiveEnvironmentKey = project.DefaultEnvironmentKey
	}

	for i := range project.Connections {
		conn := &project.Connections[i]
		if conn.ID == "" {
			conn.ID = uuid.NewString()
		}
		conn.ProjectID = project.ID
		if conn.AdvancedMeta == nil {
			conn.AdvancedMeta = map[string]string{}
		}
	}

	if project.Assets == nil {
		project.Assets = []models.ProjectAsset{}
	}
	for i := range project.Assets {
		asset := &project.Assets[i]
		if asset.ID == "" {
			asset.ID = uuid.NewString()
		}
		asset.ProjectID = project.ID
		if asset.CreatedAt == "" {
			asset.CreatedAt = now
		}
		if asset.UpdatedAt == "" {
			asset.UpdatedAt = now
		}
		if asset.Tags == nil {
			asset.Tags = []string{}
		}
	}

}

func cloneProject(project *models.Project) *models.Project {
	if project == nil {
		return nil
	}

	raw, _ := json.Marshal(project)
	var copy models.Project
	_ = json.Unmarshal(raw, &copy)
	return &copy
}
