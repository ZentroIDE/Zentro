// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"zentro/internal/models"
	"zentro/internal/utils"
)

// ErrNotZentroProject is returned when a directory has no project.json. Its
// message is a stable contract: the frontend matches on it to offer "create a
// new project" instead of showing a raw filesystem error.
var ErrNotZentroProject = errors.New("not a zentro project")

type ProjectService struct {
	logger *slog.Logger
}

type projectDirectoryCandidate struct {
	project              *models.Project
	requiresNewAdmission bool
}

func NewProjectService(logger *slog.Logger) *ProjectService {
	return &ProjectService{logger: logger}
}

func (s *ProjectService) ListProjects() ([]*models.Project, error) {
	return utils.LoadProjects()
}

func (s *ProjectService) GetProject(projectID string) (*models.Project, error) {
	return utils.LoadProject(projectID)
}

func (s *ProjectService) CreateProject(input models.Project) (*models.Project, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, fmt.Errorf("project name is required")
	}

	projects, err := utils.LoadProjects()
	if err != nil {
		return nil, err
	}

	if input.ID == "" {
		input.ID = uuid.NewString()
	}
	if input.Slug == "" {
		input.Slug = models.Slugify(input.Name)
	}

	for _, existing := range projects {
		if existing.ID == input.ID {
			return nil, fmt.Errorf("project %q already exists", input.ID)
		}
		if existing.Slug == input.Slug {
			return nil, fmt.Errorf("project slug %q already exists", input.Slug)
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if input.CreatedAt == "" {
		input.CreatedAt = now
	}
	if !input.AutoSchemaSnapshots {
		input.AutoSchemaSnapshots = true
	}
	input.UpdatedAt = now

	project := &input
	if err := utils.UpsertProject(project); err != nil {
		return nil, err
	}

	created, err := utils.LoadProject(project.ID)
	if err != nil {
		return nil, err
	}

	// Auto-initialize source control in the project directory so the project
	// storage remains the single repo and source of truth.
	repoPath := strings.TrimSpace(created.StoragePath)
	if repoPath != "" {
		if err := ensureGitRepository(repoPath); err != nil {
			_ = utils.DeleteProject(created.ID)
			return nil, fmt.Errorf("initialize project source control: %w", err)
		}
	}

	if s.logger != nil {
		s.logger.Info("created project", "project_id", project.ID, "slug", project.Slug)
	}
	return utils.LoadProject(project.ID)
}

func ensureGitRepository(repoPath string) error {
	if strings.TrimSpace(repoPath) == "" {
		return fmt.Errorf("repository path is required")
	}
	_, err := NewGitRepoAdapter().EnsureManagedRepo(repoPath, "project", managedGitRepoOptions{
		BootstrapInitialCommit: true,
		InitialCommitMessage:   initialProjectCommitMessage,
	})
	return err
}

func (s *ProjectService) SaveProject(project models.Project) (*models.Project, error) {
	if strings.TrimSpace(project.Name) == "" {
		return nil, fmt.Errorf("project name is required")
	}

	project.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := utils.UpsertProject(&project); err != nil {
		return nil, err
	}
	if s.logger != nil {
		s.logger.Info("saved project", "project_id", project.ID, "slug", project.Slug)
	}
	return utils.LoadProject(project.ID)
}

// TouchLastOpened stamps LastOpenedAt on the project without bumping
// UpdatedAt, so "last used" (open activity) stays independent of "last
// updated" (metadata edits) for project sorting.
func (s *ProjectService) TouchLastOpened(projectID string) (*models.Project, error) {
	project, err := utils.LoadProject(projectID)
	if err != nil {
		return nil, err
	}
	project.LastOpenedAt = time.Now().UTC().Format(time.RFC3339)
	if err := utils.UpsertProject(project); err != nil {
		return nil, err
	}
	return utils.LoadProject(projectID)
}

func (s *ProjectService) DeleteProject(projectID string) error {
	if s.logger != nil {
		s.logger.Info("deleting project", "project_id", projectID)
	}
	return utils.DeleteProject(projectID)
}

func (s *ProjectService) GetDefaultProjectStorageRoot() (string, error) {
	return utils.DefaultProjectStorageRoot()
}

func (s *ProjectService) OpenProjectFromDirectory(directoryPath string) (*models.Project, error) {
	candidate, err := s.inspectProjectDirectory(directoryPath)
	if err != nil {
		return nil, err
	}
	return s.openProjectDirectoryCandidate(candidate)
}

func (s *ProjectService) inspectProjectDirectory(directoryPath string) (*projectDirectoryCandidate, error) {
	path := strings.TrimSpace(directoryPath)
	if path == "" {
		return nil, fmt.Errorf("project directory is required")
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve project directory: %w", err)
	}

	manifestPath := filepath.Join(absPath, "project.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("%w: %s has no project.json", ErrNotZentroProject, absPath)
		}
		return nil, fmt.Errorf("read project manifest: %w", err)
	}

	var project models.Project
	if err := json.Unmarshal(data, &project); err != nil {
		return nil, fmt.Errorf("parse project manifest: %w", err)
	}
	project.StoragePath = absPath

	existingProjects, err := utils.LoadProjects()
	if err != nil {
		return nil, err
	}
	for _, existing := range existingProjects {
		if existing == nil || existing.ID == "" {
			continue
		}
		if existing.ID != project.ID {
			continue
		}

		if sameProjectStorage(existing.StoragePath, absPath) {
			return &projectDirectoryCandidate{
				project:              &project,
				requiresNewAdmission: false,
			}, nil
		}

		if projectManifestExists(existing.StoragePath) {
			return nil, fmt.Errorf(
				"project %q is already admitted from another folder; reopen the existing entry instead of importing a copied folder",
				project.Name,
			)
		}

		return &projectDirectoryCandidate{
			project:              &project,
			requiresNewAdmission: false,
		}, nil
	}

	return &projectDirectoryCandidate{
		project:              &project,
		requiresNewAdmission: true,
	}, nil
}

func (s *ProjectService) openProjectDirectoryCandidate(candidate *projectDirectoryCandidate) (*models.Project, error) {
	if candidate == nil || candidate.project == nil {
		return nil, fmt.Errorf("project directory is required")
	}

	if err := utils.UpsertProject(candidate.project); err != nil {
		return nil, err
	}
	return utils.LoadProject(candidate.project.ID)
}

func sameProjectStorage(left, right string) bool {
	normalizedLeft := filepath.Clean(strings.TrimSpace(left))
	normalizedRight := filepath.Clean(strings.TrimSpace(right))
	if normalizedLeft == "." || normalizedRight == "." {
		return false
	}
	return normalizedLeft == normalizedRight
}

func projectManifestExists(storagePath string) bool {
	trimmed := strings.TrimSpace(storagePath)
	if trimmed == "" {
		return false
	}
	_, err := os.Stat(filepath.Join(trimmed, "project.json"))
	return err == nil
}
