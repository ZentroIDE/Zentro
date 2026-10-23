// SPDX-License-Identifier: GPL-3.0-only

// Package utils — project persistence layer.
//
// Project state is split across sibling files in this package by concern:
//   - projects.go             — constants + public CRUD API (LoadProjects, SaveProjects, LoadProject, UpsertProject, DeleteProject)
//   - projects_storage.go     — config dir resolution, storage path allocation, manifest I/O
//   - projects_registry.go    — project-index.json registry + legacy projects.json migration
//   - projects_normalize.go   — normalizeProject (defaults) + cloneProject (deep copy)
//   - projects_secrets.go     — OS keyring round-trip for connection passwords
package utils

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"zentro/internal/models"
)

const (
	projectRegistryFileName = "project-index.json"
	legacyProjectsFileName  = "projects.json"
	projectManifestFileName = "project.json"
)

func LoadProjects() ([]*models.Project, error) {
	registry, err := loadProjectRegistry()
	if err != nil {
		return []*models.Project{}, err
	}
	projects := make([]*models.Project, 0, len(registry.Projects))
	for _, entry := range registry.Projects {
		project, loadErr := loadProjectFromEntry(entry)
		if loadErr != nil {
			continue
		}
		projects = append(projects, project)
	}

	sort.SliceStable(projects, func(i, j int) bool {
		return projects[i].UpdatedAt > projects[j].UpdatedAt
	})
	return projects, nil
}

func SaveProjects(projects []*models.Project) error {
	registry, err := loadProjectRegistry()
	if err != nil {
		return err
	}

	existingByID := make(map[string]projectIndexEntry, len(registry.Projects))
	for _, entry := range registry.Projects {
		existingByID[entry.ID] = entry
	}

	nextRegistry := &projectRegistry{Projects: []projectIndexEntry{}}
	seen := make(map[string]bool)
	for _, project := range projects {
		if project == nil {
			continue
		}
		normalizeProject(project)
		storagePath, pathErr := ensureProjectStoragePath(project)
		if pathErr != nil {
			return pathErr
		}
		project.StoragePath = storagePath
		if err := saveProjectManifest(project); err != nil {
			return err
		}
		nextRegistry.Projects = append(nextRegistry.Projects, buildProjectIndexEntry(project))
		seen[project.ID] = true
	}

	for id, entry := range existingByID {
		if seen[id] {
			continue
		}
		project, loadErr := loadProjectFromEntry(entry)
		if loadErr == nil {
			for _, connection := range project.Connections {
				if connection.ID != "" {
					_ = DeletePassword(projectConnectionSecretKey(connection.ID))
				}
			}
		}
	}

	return saveProjectRegistry(nextRegistry)
}

func LoadProject(projectID string) (*models.Project, error) {
	registry, err := loadProjectRegistry()
	if err != nil {
		return nil, err
	}
	for _, entry := range registry.Projects {
		if entry.ID == projectID {
			return loadProjectFromEntry(entry)
		}
	}
	return nil, fmt.Errorf("project %q not found", projectID)
}

func UpsertProject(project *models.Project) error {
	if project == nil {
		return fmt.Errorf("project is required")
	}
	normalizeProject(project)
	storagePath, err := ensureProjectStoragePath(project)
	if err != nil {
		return err
	}
	project.StoragePath = storagePath

	if err := saveProjectManifest(project); err != nil {
		return err
	}

	registry, err := loadProjectRegistry()
	if err != nil {
		return err
	}

	entry := buildProjectIndexEntry(project)
	updated := false
	for i := range registry.Projects {
		if registry.Projects[i].ID == project.ID {
			registry.Projects[i] = entry
			updated = true
			break
		}
	}
	if !updated {
		registry.Projects = append(registry.Projects, entry)
	}
	return saveProjectRegistry(registry)
}

func DeleteProject(projectID string) error {
	registry, err := loadProjectRegistry()
	if err != nil {
		return err
	}

	filtered := make([]projectIndexEntry, 0, len(registry.Projects))
	var deletedEntry *projectIndexEntry
	for _, entry := range registry.Projects {
		if entry.ID == projectID {
			entryCopy := entry
			deletedEntry = &entryCopy
			project, loadErr := loadProjectFromEntry(entry)
			if loadErr == nil {
				for _, connection := range project.Connections {
					if connection.ID != "" {
						_ = DeletePassword(projectConnectionSecretKey(connection.ID))
					}
				}
			}
			continue
		}
		filtered = append(filtered, entry)
	}
	if deletedEntry == nil {
		return fmt.Errorf("project %q not found", projectID)
	}
	registry.Projects = filtered
	if err := saveProjectRegistry(registry); err != nil {
		return err
	}
	if deletedEntry != nil {
		storagePath := strings.TrimSpace(deletedEntry.StoragePath)
		if storagePath != "" {
			if err := DeleteProjectScriptsAtPath(storagePath); err != nil {
				return err
			}
			if err := os.RemoveAll(storagePath); err != nil {
				return fmt.Errorf("projects: remove storage path: %w", err)
			}
		}
	}
	return nil
}
