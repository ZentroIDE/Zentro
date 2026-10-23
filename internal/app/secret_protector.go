// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"

	"zentro/internal/models"
	"zentro/internal/utils"
)

// SecretProtector decides whether saved credentials may leave the app and strips
// them from profiles and projects when they may not. The core has none (a nil
// Services.Security means every secret is reachable); an edition that sells a
// secret vault registers one from a pro_* file (edition.go, onWire).
type SecretProtector interface {
	CanAccessSecrets() bool
	SanitizeProfiles(profiles []*models.ConnectionProfile) []*models.ConnectionProfile
	SanitizeProject(project *models.Project) *models.Project
}

// populateProtectedProfilePassword fills in a profile's password from the OS
// keychain when the caller did not send one.
func (a *App) populateProtectedProfilePassword(profileName string, projectConnectionID string, password string) (string, error) {
	if strings.TrimSpace(password) != "" {
		return password, nil
	}
	if strings.TrimSpace(projectConnectionID) != "" {
		return utils.GetPassword("project-connection:" + strings.TrimSpace(projectConnectionID))
	}
	if strings.TrimSpace(profileName) != "" {
		return utils.GetPassword(strings.TrimSpace(profileName))
	}
	return "", nil
}
