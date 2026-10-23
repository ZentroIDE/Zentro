// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/models"
)

func (a *App) ensureWritable(op string) error {
	if a.prefs.ViewMode {
		return fmt.Errorf("view mode is enabled: %s is blocked", op)
	}
	return nil
}

func (a *App) currentProjectEnvironmentKey() models.EnvironmentKey {
	if a.project == nil {
		return ""
	}
	if a.currentEnvironmentKey != "" {
		return a.currentEnvironmentKey
	}
	if a.project.DefaultEnvironmentKey != "" {
		return a.project.DefaultEnvironmentKey
	}
	if len(a.project.Environments) > 0 {
		return a.project.Environments[0].Key
	}
	return ""
}

func (a *App) currentProjectSchema() string {
	if a.project == nil {
		return ""
	}
	activeKey := a.currentProjectEnvironmentKey()
	for i := range a.project.Environments {
		environment := a.project.Environments[i]
		if environment.Key == activeKey {
			return strings.TrimSpace(environment.LastSchema)
		}
	}
	return ""
}

// activateProject makes project the active session: acquires the project
// lock (releasing whatever project this window previously held), optionally
// stamps LastOpenedAt, sets it as current (sanitized when secrets aren't
// accessible), resolves the environment key to resume, and resets the audit
// log + switches the app log to the project's storage path. This is the
// single sequence shared by CreateProject, OpenProject, and
// OpenProjectFromDirectory.
func (a *App) activateProject(
	project *models.Project,
	touchLastOpened bool,
	sanitizeSecurity bool,
) (*models.Project, error) {
	if err := a.svc.ProjectLock.SwitchTo(project.ID, project.Name, currentProjectID(a.project)); err != nil {
		return nil, err
	}
	if touchLastOpened {
		if touched, touchErr := a.svc.Projects.TouchLastOpened(project.ID); touchErr == nil {
			project = touched
		}
	}
	a.project = project
	if sanitizeSecurity && a.svc.Security != nil && !a.svc.Security.CanAccessSecrets() {
		a.project = a.svc.Security.SanitizeProject(project)
	}
	a.currentEnvironmentKey = resolveEnvironmentKey(project)
	a.svc.Audit.Reset()
	a.svc.AppLog.SwitchToProject(project.StoragePath)
	return project, nil
}

func (a *App) saveActiveProject() (*models.Project, error) {
	if a.project == nil {
		return nil, sql.ErrNoRows
	}
	saved, err := a.svc.Projects.SaveProject(*a.project)
	if err != nil {
		return nil, err
	}
	if a.svc.Security != nil && !a.svc.Security.CanAccessSecrets() {
		a.project = a.svc.Security.SanitizeProject(saved)
	} else {
		a.project = saved
	}
	return saved, nil
}
