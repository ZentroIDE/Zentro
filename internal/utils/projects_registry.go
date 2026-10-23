// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"fmt"
	"os"

	"zentro/internal/models"
)

type projectIndexEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	UpdatedAt   string `json:"updated_at"`
	CreatedAt   string `json:"created_at"`
	StoragePath string `json:"storage_path"`
}

type projectRegistry struct {
	Projects []projectIndexEntry `json:"projects"`
}

func buildProjectIndexEntry(project *models.Project) projectIndexEntry {
	return projectIndexEntry{
		ID:          project.ID,
		Name:        project.Name,
		Slug:        project.Slug,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
		StoragePath: project.StoragePath,
	}
}

func loadProjectFromEntry(entry projectIndexEntry) (*models.Project, error) {
	manifestPath := projectManifestPath(entry.StoragePath)
	project, err := readManifestProject(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("projects: read manifest for %q: %w", entry.ID, err)
	}
	normalizeProject(project)
	if project.ID == "" {
		project.ID = entry.ID
	}
	project.StoragePath = entry.StoragePath
	return project, nil
}

func loadLegacyRegistry(path string) ([]*models.Project, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []*models.Project{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("projects: read legacy registry: %w", err)
	}

	var legacy struct {
		Projects []*models.Project `json:"projects"`
	}
	if err := json.Unmarshal(data, &legacy); err != nil {
		return nil, fmt.Errorf("projects: unmarshal legacy registry: %w", err)
	}
	if legacy.Projects == nil {
		legacy.Projects = []*models.Project{}
	}
	return legacy.Projects, nil
}

func loadProjectRegistry() (*projectRegistry, error) {
	path, err := projectRegistryPath()
	if err != nil {
		return &projectRegistry{Projects: []projectIndexEntry{}}, err
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		legacyPath, legacyErr := legacyProjectsPath()
		if legacyErr != nil {
			return &projectRegistry{Projects: []projectIndexEntry{}}, legacyErr
		}
		legacyProjects, legacyErr := loadLegacyRegistry(legacyPath)
		if legacyErr != nil {
			return &projectRegistry{Projects: []projectIndexEntry{}}, legacyErr
		}
		if len(legacyProjects) == 0 {
			return &projectRegistry{Projects: []projectIndexEntry{}}, nil
		}

		registry := &projectRegistry{Projects: []projectIndexEntry{}}
		for _, project := range legacyProjects {
			if project == nil {
				continue
			}
			normalizeProject(project)
			storagePath, storageErr := ensureProjectStoragePath(project)
			if storageErr != nil {
				return nil, storageErr
			}
			project.StoragePath = storagePath
			if manifestErr := saveProjectManifest(project); manifestErr != nil {
				return nil, manifestErr
			}
			registry.Projects = append(registry.Projects, buildProjectIndexEntry(project))
		}
		if saveErr := saveProjectRegistry(registry); saveErr != nil {
			return nil, saveErr
		}
		return registry, nil
	}
	if err != nil {
		return &projectRegistry{Projects: []projectIndexEntry{}}, fmt.Errorf("projects: read registry: %w", err)
	}

	var registry projectRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return &projectRegistry{Projects: []projectIndexEntry{}}, fmt.Errorf("projects: unmarshal registry: %w", err)
	}
	if registry.Projects == nil {
		registry.Projects = []projectIndexEntry{}
	}
	return &registry, nil
}

func saveProjectRegistry(registry *projectRegistry) error {
	path, err := projectRegistryPath()
	if err != nil {
		return err
	}
	if registry == nil {
		registry = &projectRegistry{Projects: []projectIndexEntry{}}
	}
	if registry.Projects == nil {
		registry.Projects = []projectIndexEntry{}
	}

	data, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return fmt.Errorf("projects: marshal registry: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("projects: write registry: %w", err)
	}
	return os.Rename(tmp, path)
}
