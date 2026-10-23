// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/utils"

// ConnectionUsageRef names one project environment that references a pool
// connection — backs the "used by N environments" hint shown before
// deleting or editing a connection in Settings, since a connection is a
// shared gateway every project referencing it depends on.
type ConnectionUsageRef struct {
	ProjectID       string `json:"project_id"`
	ProjectName     string `json:"project_name"`
	EnvironmentKey  string `json:"environment_key"`
	EnvironmentName string `json:"environment_name"`
	// Database bound for this environment on the connection ("" if the
	// environment references the connection but hasn't picked a database).
	Database string `json:"database"`
}

// ListConnectionUsage scans every project for environments whose
// ConnectionRef is id, so Settings can show what would be affected by
// editing or deleting that connection.
func (s *ConnectionService) ListConnectionUsage(id string) ([]ConnectionUsageRef, error) {
	if id == "" {
		return nil, nil
	}
	projects, err := utils.LoadProjects()
	if err != nil {
		return nil, err
	}
	var usage []ConnectionUsageRef
	for _, project := range projects {
		if project == nil {
			continue
		}
		for _, env := range project.Environments {
			if env.ConnectionRef != id {
				continue
			}
			usage = append(usage, ConnectionUsageRef{
				ProjectID:       project.ID,
				ProjectName:     project.Name,
				EnvironmentKey:  string(env.Key),
				EnvironmentName: env.Label,
				Database:        env.LastDatabase,
			})
		}
	}
	return usage, nil
}
