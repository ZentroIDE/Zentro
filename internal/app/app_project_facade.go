// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"zentro/internal/extensions/license"
	"zentro/internal/models"
)

func (a *App) ListProjects() ([]*models.Project, error) { return a.svc.Projects.ListProjects() }

// resolveEnvironmentKey picks the environment to connect to on project
// load: the last one the user was actively working in, falling back to
// the project's configured default when none was recorded yet.
func resolveEnvironmentKey(project *models.Project) models.EnvironmentKey {
	if project.LastActiveEnvironmentKey != "" {
		return project.LastActiveEnvironmentKey
	}
	return project.DefaultEnvironmentKey
}

// isAtFreeTierProjectCap returns true when the user is on Free tier and
// already has the maximum number of allowed projects.
func (a *App) isAtFreeTierProjectCap() (bool, error) {
	projectLimit := a.svc.License.GetLimitValue(license.LimitMaxProjects)
	if projectLimit < 0 {
		return false, nil
	}
	existing, err := a.svc.Projects.ListProjects()
	if err != nil {
		return false, err
	}
	return int64(len(existing)) >= projectLimit, nil
}

func (a *App) GetProject(projectID string) (*models.Project, error) {
	project, err := a.svc.Projects.GetProject(projectID)
	if err != nil {
		return nil, err
	}
	if a.svc.Security != nil {
		return a.svc.Security.SanitizeProject(project), nil
	}
	return project, nil
}

func (a *App) CreateProject(p models.Project) (*models.Project, error) {
	if atCap, err := a.isAtFreeTierProjectCap(); err != nil {
		return nil, err
	} else if atCap {
		return nil, fmt.Errorf(
			"free plan limit: you can have up to %d projects. Upgrade to Pro for unlimited projects",
			a.svc.License.GetLimitValue(license.LimitMaxProjects),
		)
	}

	project, err := a.svc.Projects.CreateProject(p)
	if err != nil {
		return nil, err
	}
	return a.activateProject(project, false, true)
}

func (a *App) SaveProject(p models.Project) (*models.Project, error) {
	project, err := a.svc.Projects.SaveProject(p)
	if err != nil {
		return nil, err
	}
	if a.project == nil || a.project.ID == project.ID {
		a.project = project
		if a.currentEnvironmentKey == "" {
			a.currentEnvironmentKey = resolveEnvironmentKey(project)
		}
	}
	return project, nil
}

func (a *App) DeleteProject(projectID string) error {
	if a.project != nil && a.project.ID == projectID {
		a.project = nil
		a.currentEnvironmentKey = ""
		a.svc.AppLog.SwitchToProject("") // revert to global zentro.log
		a.svc.ProjectLock.Release(projectID)
	}
	return a.svc.Projects.DeleteProject(projectID)
}

// currentProjectID returns the active project's ID or "" when none is open.
func currentProjectID(project *models.Project) string {
	if project == nil {
		return ""
	}
	return project.ID
}

func (a *App) OpenProject(projectID string) (*models.Project, error) {
	project, err := a.svc.Projects.GetProject(projectID)
	if err != nil {
		return nil, err
	}
	return a.activateProject(project, true, true)
}

// OpenProjectInNewWindow launches a new Zentro window for projectID,
// separate from the currently active window's project.
func (a *App) OpenProjectInNewWindow(projectID string) error {
	if projectID != "" && projectID == currentProjectID(a.project) {
		// Already the project open in THIS window — nothing to switch to,
		// no duplicate window to spawn.
		return nil
	}
	if a.svc.ProjectLock.FocusHolder(projectID) {
		// Another window already has it open and is now focused — no need
		// to spawn a new process that would immediately hit the lock.
		return nil
	}
	return spawnInstanceForProject(projectID)
}

// GetLaunchProjectID returns and clears the project id this process was
// launched with (via --project=<id>), if any. Consumed once at startup so a
// later app reload in the same process doesn't force-reopen it.
func (a *App) GetLaunchProjectID() string {
	id := a.launchProjectID
	a.launchProjectID = ""
	if a.logger != nil {
		a.logger.Info("GetLaunchProjectID consumed", "projectID", id)
	}
	return id
}

// SetLaunchProjectID is called from main() after parsing os.Args, before
// Wails starts the window.
func (a *App) SetLaunchProjectID(projectID string) {
	a.launchProjectID = projectID
}

func (a *App) GetActiveProject() *models.Project {
	if a.svc.Security != nil {
		return a.svc.Security.SanitizeProject(a.project)
	}
	return a.project
}

func (a *App) GetDefaultProjectStorageRoot() (string, error) {
	return a.svc.Projects.GetDefaultProjectStorageRoot()
}

func (a *App) PickDirectory(initialPath string) (string, error) {
	defaultDir := strings.TrimSpace(initialPath)
	if defaultDir == "" {
		root, err := a.svc.Projects.GetDefaultProjectStorageRoot()
		if err == nil {
			defaultDir = root
		}
	}
	return a.openDirectoryDialog("Select directory", defaultDir)
}

func (a *App) OpenProjectFromDirectory(directoryPath string) (*models.Project, error) {
	candidate, err := a.svc.Projects.inspectProjectDirectory(directoryPath)
	if err != nil {
		return nil, err
	}

	if candidate.requiresNewAdmission {
		atCap, err := a.isAtFreeTierProjectCap()
		if err != nil {
			return nil, err
		}
		if atCap {
			return nil, fmt.Errorf(
				"free plan limit: you can have up to %d projects. Upgrade to Pro for unlimited projects",
				a.svc.License.GetLimitValue(license.LimitMaxProjects),
			)
		}
	}

	project, err := a.svc.Projects.openProjectDirectoryCandidate(candidate)
	if err != nil {
		return nil, err
	}

	return a.activateProject(project, true, false)
}

func (a *App) OpenDirectoryInExplorer(path string) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return fmt.Errorf("path is required")
	}

	absPath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return fmt.Errorf("resolve path: %w", err)
	}

	stat, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("path does not exist: %w", err)
	}

	target := absPath
	if !stat.IsDir() {
		target = filepath.Dir(absPath)
	}

	cmd := fileManagerCmd(target)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("open explorer: %w", err)
	}
	return nil
}

func (a *App) OpenFileInDefaultApp(path string) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return fmt.Errorf("path is required")
	}

	absPath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return fmt.Errorf("resolve path: %w", err)
	}

	stat, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("path does not exist: %w", err)
	}
	if stat.IsDir() {
		return fmt.Errorf("path must be a file")
	}

	cmd := openPathCmd(absPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	return nil
}
