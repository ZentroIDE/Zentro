// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

// Template facade — thin delegates to TemplateService (template_service.go).

func (a *App) LoadTemplates() ([]models.Template, error) { return a.svc.Templates.LoadTemplates() }

func (a *App) SaveTemplate(t models.Template) error {
	return a.svc.Templates.SaveTemplate(t)
}

func (a *App) DeleteTemplate(id string) error {
	return a.svc.Templates.DeleteTemplate(id)
}
