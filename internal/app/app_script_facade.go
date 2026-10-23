// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

// Script facade — thin delegates to ScriptService (script_service.go).

func (a *App) GetScripts(projectID, connectionName string) ([]models.SavedScript, error) {
	return a.svc.Scripts.GetScripts(projectID, connectionName)
}

func (a *App) GetScriptContent(projectID, connectionName, scriptID string) (string, error) {
	return a.svc.Scripts.GetScriptContent(projectID, connectionName, scriptID)
}

func (a *App) SaveScript(script models.SavedScript, content string) error {
	return a.svc.Scripts.SaveScript(script, content)
}

func (a *App) DeleteScript(projectID, connectionName, scriptID string) error {
	return a.svc.Scripts.DeleteScript(projectID, connectionName, scriptID)
}
