// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"strings"

	"zentro/internal/extensions/querystat"
	"zentro/internal/models"
)

// What an agent may learn about the app itself.
//
// Every context tool answers from the types below, never from a models value
// serialized as it is. A model type such as ConnectionProfile or Project carries
// a password, a local path, or editor text; copying a field into a DTO is a
// deliberate choice, and the tests check that the forbidden ones never appear.
// Allowed: names, ids, drivers, environment keys, policy numbers, counts.
// Never: passwords, tokens, keys, host, port, user name (unless the user turned
// on connection details), local paths, editor text, statement text.

// aiAppInfo is what the app knows about itself that the tools may show.
type aiAppInfo struct {
	Version    string
	Channel    string
	OS         string
	Plan       string
	PlanStatus string
	ViewMode   bool
}

// aiContextSource is how the context tools reach the rest of the app. The App
// fills it with closures, so a tool imports no service and a test gives it
// fixed data.
type aiContextSource struct {
	appInfo       func() aiAppInfo
	projects      func() ([]*models.Project, error)
	connections   func() []*models.ConnectionProfile
	policy        func(envKey string) ExecutionPolicy
	scriptList    func(projectID, connectionName string) ([]models.SavedScript, error)
	relationships func(ctx context.Context, schema, table string) ([]models.TableRelationship, error)
	// The next four feed the activity tools.
	audit       func(limit int) ([]SQLAuditEntry, error)
	gitStatus   func() (GitTrackingStatus, error)
	gitTimeline func(limit int) ([]GitTimelineItem, error)
	queryStats  func(windowMins, limit int) querystat.StatReport
}

type aiPolicyDTO struct {
	SafetyLevel    string `json:"safetyLevel"`
	Strictness     string `json:"strictness"`
	RowCapPerTab   int    `json:"rowCapPerTab"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	Production     bool   `json:"production"`
	Locked         bool   `json:"locked"`
}

func policyDTO(policy ExecutionPolicy) aiPolicyDTO {
	return aiPolicyDTO{
		SafetyLevel:    policy.SafetyLevel,
		Strictness:     policy.EnvironmentStrictness,
		RowCapPerTab:   policy.RowCapPerTab,
		TimeoutSeconds: policy.TimeoutSeconds,
		Production:     policy.IsProduction,
		Locked:         policy.Locked,
	}
}

type aiProjectRefDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type aiAppContextDTO struct {
	Version     string           `json:"version"`
	Channel     string           `json:"channel"`
	OS          string           `json:"os"`
	Plan        string           `json:"plan"`
	PlanStatus  string           `json:"planStatus"`
	ViewMode    bool             `json:"viewMode"`
	Project     *aiProjectRefDTO `json:"project"`
	Environment string           `json:"environment"`
	Connection  string           `json:"connection"`
	Driver      string           `json:"driver"`
	Database    string           `json:"database"`
	Schema      string           `json:"schema"`
	Policy      *aiPolicyDTO     `json:"policy"`
}

type aiProjectDTO struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Tags         []string `json:"tags"`
	LastOpenedAt string   `json:"lastOpenedAt"`
	Environments int      `json:"environments"`
	Active       bool     `json:"active"`
}

// aiEnvironmentDTO is one environment slot of a project. Protected and
// ReadOnly are labels the user set; the app enforces safety through Policy.
type aiEnvironmentDTO struct {
	Key        string      `json:"key"`
	Label      string      `json:"label"`
	Active     bool        `json:"active"`
	Bound      bool        `json:"bound"`
	Connection string      `json:"connection"`
	Database   string      `json:"database"`
	Schema     string      `json:"schema"`
	Catalog    string      `json:"catalog"`
	Protected  bool        `json:"protectedLabel"`
	ReadOnly   bool        `json:"readOnlyLabel"`
	Policy     aiPolicyDTO `json:"policy"`
}

// aiConnectionDTO is one saved connection. Details is only set when the user
// turned on connection details; it never holds a password.
type aiConnectionDTO struct {
	ID      string               `json:"id"`
	Name    string               `json:"name"`
	Driver  string               `json:"driver"`
	SSLMode string               `json:"sslMode"`
	Active  bool                 `json:"active"`
	BoundTo []string             `json:"boundToEnvironments"`
	Details *aiConnectionDetails `json:"details,omitempty"`
}

type aiConnectionDetails struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	// File is the file name of a SQLite database, never its folder.
	File string `json:"file,omitempty"`
}

// aiAuditDTO is one run from the history, without the statement, the error
// text, or the reason the user typed: those are the user's own words and data.
type aiAuditDTO struct {
	ExecutedAt  string   `json:"executedAt"`
	Connection  string   `json:"connection"`
	Database    string   `json:"database"`
	Driver      string   `json:"driver"`
	Environment string   `json:"environment"`
	DurationMs  int64    `json:"durationMs"`
	RowCount    int64    `json:"rowCount"`
	IsSelect    bool     `json:"isSelect"`
	RiskLevel   string   `json:"riskLevel"`
	Failed      bool     `json:"failed"`
	Protections []string `json:"protections"`
	Pinned      bool     `json:"pinned"`
}

type aiGitCommitDTO struct {
	Message string `json:"message"`
	Kind    string `json:"kind"`
	When    string `json:"when"`
	Files   int    `json:"files"`
}

// aiGitDTO describes the project's change history. It has no repository path,
// no author, no file contents, and no commit hash: a hash that happens to be all
// digits looks like a phone number to the scanner that guards every result.
type aiGitDTO struct {
	Enabled        bool             `json:"enabled"`
	Initialized    bool             `json:"initialized"`
	PendingChanges int              `json:"pendingChanges"`
	HasError       bool             `json:"hasError"`
	Recent         []aiGitCommitDTO `json:"recent"`
}

type aiPatternDTO struct {
	Pattern string  `json:"pattern"`
	Count   int     `json:"count"`
	Errors  int     `json:"errors"`
	AvgMs   float64 `json:"avgMs"`
	P95Ms   int64   `json:"p95Ms"`
	TotalMs int64   `json:"totalMs"`
}

type aiQueryStatsDTO struct {
	TotalRuns   int            `json:"totalRuns"`
	ErrorRate   float64        `json:"errorRate"`
	AvgMs       float64        `json:"avgMs"`
	P95Ms       int64          `json:"p95Ms"`
	WindowMins  int            `json:"windowMinutes"`
	TopByImpact []aiPatternDTO `json:"topByImpact"`
	TopByCount  []aiPatternDTO `json:"topByCount"`
}

type aiScriptDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Connection string `json:"connection"`
	UpdatedAt  string `json:"updatedAt"`
}

type aiRelationDTO struct {
	Constraint string `json:"constraint"`
	FromTable  string `json:"fromTable"`
	FromColumn string `json:"fromColumn"`
	ToTable    string `json:"toTable"`
	ToColumn   string `json:"toColumn"`
	OnDelete   string `json:"onDelete"`
	OnUpdate   string `json:"onUpdate"`
	// Deferrable is null when the driver does not report it.
	Deferrable   *bool  `json:"deferrable"`
	OtherSchema  string `json:"otherSchema,omitempty"`
	TableIsChild bool   `json:"tableIsChild"`
}

type aiSQLRiskDTO struct {
	Statements       int      `json:"statements"`
	Operations       []string `json:"operations"`
	HasWrite         bool     `json:"hasWrite"`
	HasDestructive   bool     `json:"hasDestructive"`
	HasUpdateNoWhere bool     `json:"hasUpdateWithoutWhere"`
	HasDeleteNoWhere bool     `json:"hasDeleteWithoutWhere"`
	// The fields below judge the SQL under one environment's policy
	// (classifyForEnv, spec section 4).
	Env         string                    `json:"env"`
	Verdict     string                    `json:"verdict"`
	Reasons     []aiClassifyReasonDTO     `json:"reasons"`
	Suggestions []aiClassifySuggestionDTO `json:"suggestions"`
}

// connectionNames maps a connection id to its display name.
func (src aiContextSource) connectionNames() map[string]string {
	names := map[string]string{}
	if src.connections == nil {
		return names
	}
	for _, profile := range src.connections() {
		if profile != nil {
			names[profile.ID] = profile.Name
		}
	}
	return names
}

func environmentDTOs(project *models.Project, active string, names map[string]string, src aiContextSource) []aiEnvironmentDTO {
	out := make([]aiEnvironmentDTO, 0, len(project.Environments))
	for _, env := range project.Environments {
		key := string(env.Key)
		item := aiEnvironmentDTO{
			Key:       key,
			Label:     env.Label,
			Active:    strings.EqualFold(key, active),
			Bound:     env.ConnectionRef != "" && env.LastDatabase != "",
			Database:  publicSchemaName(env.LastDatabase),
			Schema:    publicSchemaName(env.LastSchema),
			Catalog:   publicSchemaName(env.LastCatalog),
			Protected: env.IsProtected,
			ReadOnly:  env.IsReadOnly,
		}
		if env.ConnectionRef != "" {
			item.Connection = names[env.ConnectionRef]
		}
		if src.policy != nil {
			item.Policy = policyDTO(src.policy(key))
		}
		out = append(out, item)
	}
	return out
}
