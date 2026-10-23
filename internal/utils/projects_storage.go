// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"zentro/internal/models"
)

func projectConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("projects: config dir: %w", err)
	}
	dir := filepath.Join(base, "zentro")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("projects: mkdir: %w", err)
	}
	return dir, nil
}

func projectRegistryPath() (string, error) {
	dir, err := projectConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, projectRegistryFileName), nil
}

func legacyProjectsPath() (string, error) {
	dir, err := projectConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, legacyProjectsFileName), nil
}

// DefaultProjectStorageRoot returns the runtime default root folder for project data.
func DefaultProjectStorageRoot() (string, error) {
	dir, err := projectConfigDir()
	if err != nil {
		return "", err
	}
	root := filepath.Join(dir, "projects")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", fmt.Errorf("projects: mkdir storage root: %w", err)
	}
	return root, nil
}

func projectManifestPath(storagePath string) string {
	return filepath.Join(storagePath, projectManifestFileName)
}

func readManifestProject(path string) (*models.Project, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var project models.Project
	if err := json.Unmarshal(data, &project); err != nil {
		return nil, err
	}
	return &project, nil
}

func resolveUniqueProjectDirectory(root string, slug string, projectID string) (string, error) {
	baseSlug := strings.TrimSpace(slug)
	if baseSlug == "" {
		baseSlug = "project"
	}
	for i := 0; i < 1000; i++ {
		suffix := ""
		if i > 0 {
			suffix = "-" + strconv.Itoa(i+1)
		}
		candidate := filepath.Join(root, baseSlug+suffix)
		manifestPath := projectManifestPath(candidate)

		data, err := os.ReadFile(manifestPath)
		if os.IsNotExist(err) {
			return candidate, nil
		}
		if err != nil {
			return "", fmt.Errorf("projects: read manifest: %w", err)
		}

		var existing models.Project
		if err := json.Unmarshal(data, &existing); err != nil {
			// If manifest is corrupted, skip this candidate instead of overwriting unknown data.
			continue
		}
		if existing.ID == projectID {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("projects: unable to resolve unique storage folder for %q", slug)
}

func ensureProjectStoragePath(project *models.Project) (string, error) {
	if project == nil {
		return "", fmt.Errorf("projects: nil project")
	}

	if strings.TrimSpace(project.StoragePath) != "" {
		absPath, err := filepath.Abs(strings.TrimSpace(project.StoragePath))
		if err != nil {
			return "", fmt.Errorf("projects: resolve storage path: %w", err)
		}
		if err := os.MkdirAll(absPath, 0o755); err != nil {
			return "", fmt.Errorf("projects: mkdir storage path: %w", err)
		}
		manifestPath := projectManifestPath(absPath)
		if _, err := os.Stat(manifestPath); err == nil {
			existing, err := readManifestProject(manifestPath)
			if err == nil && existing.ID != "" && existing.ID != project.ID {
				return "", fmt.Errorf("projects: storage path already belongs to another project")
			}
		}
		return absPath, nil
	}

	root, err := DefaultProjectStorageRoot()
	if err != nil {
		return "", err
	}
	candidate, err := resolveUniqueProjectDirectory(root, project.Slug, project.ID)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(candidate, 0o755); err != nil {
		return "", fmt.Errorf("projects: mkdir candidate: %w", err)
	}
	return candidate, nil
}

func saveProjectManifest(project *models.Project) error {
	if project == nil {
		return fmt.Errorf("projects: nil project")
	}
	if strings.TrimSpace(project.StoragePath) == "" {
		return fmt.Errorf("projects: storage path is required")
	}
	if err := os.MkdirAll(project.StoragePath, 0o755); err != nil {
		return fmt.Errorf("projects: mkdir storage path: %w", err)
	}

	copy := cloneProject(project)
	normalizeProject(copy)

	data, err := json.MarshalIndent(copy, "", "  ")
	if err != nil {
		return fmt.Errorf("projects: marshal manifest: %w", err)
	}

	path := projectManifestPath(copy.StoragePath)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("projects: write manifest: %w", err)
	}
	return os.Rename(tmp, path)
}
