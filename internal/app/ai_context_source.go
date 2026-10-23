// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"fmt"

	"zentro/internal/extensions/querystat"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// newAIContextSource connects the context tools to the services of the App. It
// only reads. The connection list is handed over without passwords, so a tool
// cannot reach one even by mistake.
func (a *App) newAIContextSource() *aiContextSource {
	return &aiContextSource{
		appInfo: func() aiAppInfo {
			info := aiAppInfo{
				Version:  Version,
				Channel:  utils.Channel,
				OS:       osArchLabel(),
				ViewMode: a.prefs.ViewMode,
			}
			if a.svc.License != nil {
				plan := a.svc.License.Plan()
				info.Plan, info.PlanStatus = string(plan.Tier), string(plan.Status)
			}
			return info
		},
		projects: func() ([]*models.Project, error) { return a.svc.Projects.ListProjects() },
		connections: func() []*models.ConnectionProfile {
			profiles, err := a.svc.Conn.LoadConnections()
			if err != nil {
				return nil
			}
			out := make([]*models.ConnectionProfile, 0, len(profiles))
			for _, profile := range profiles {
				if profile == nil {
					continue
				}
				copied := *profile
				copied.Password = ""
				out = append(out, &copied)
			}
			return out
		},
		policy: func(envKey string) ExecutionPolicy { return a.svc.Policy.Resolve(envKey) },
		scriptList: func(projectID, connectionName string) ([]models.SavedScript, error) {
			return a.svc.Scripts.GetScripts(projectID, connectionName)
		},
		audit: func(limit int) ([]SQLAuditEntry, error) {
			return a.svc.Audit.ListAudit(SQLAuditFilter{Limit: limit})
		},
		gitStatus: a.GetGitTrackingStatus,
		gitTimeline: func(limit int) ([]GitTimelineItem, error) {
			return a.ListGitTimeline(limit, "")
		},
		queryStats: func(windowMins, limit int) querystat.StatReport {
			return a.queryStatsReport(querystat.StatFilter{WindowMins: windowMins, Limit: limit})
		},
		relationships: func(_ context.Context, schema, table string) ([]models.TableRelationship, error) {
			db := a.db
			if db == nil || a.profile == nil {
				return nil, fmt.Errorf("no connection is open")
			}
			return a.svc.Conn.FetchTableRelationships(a.profile, db, schema, table)
		},
	}
}
