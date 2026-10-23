// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"zentro/internal/extensions/ai"
)

const aiMaxRestorePointsPerEnv = 20

type AIRestoreObjectCounts struct {
	Tables      int `json:"tables"`
	Views       int `json:"views"`
	Indexes     int `json:"indexes"`
	Constraints int `json:"constraints"`
	Routines    int `json:"routines"`
}

type AIRestorePoint struct {
	ID           string                `json:"id"`
	Env          string                `json:"env"`
	Label        string                `json:"label"`
	CreatedAt    string                `json:"createdAt"`
	Source       string                `json:"source"`
	ProposalID   string                `json:"proposalId,omitempty"`
	Scope        string                `json:"scope"`
	DataTables   []string              `json:"dataTables,omitempty"`
	ObjectCounts AIRestoreObjectCounts `json:"objectCounts"`
	SchemaHash   string                `json:"schemaHash"`
	SizeBytes    int                   `json:"sizeBytes"`
	Driver       string                `json:"driver"`
	Database     string                `json:"database"`
	Schema       string                `json:"schema"`
	Catalog      json.RawMessage       `json:"catalog,omitempty"`
}

func (s *AIService) restoresDir() string {
	root := s.sessionsDir
	if root == "" {
		root, _ = defaultAISessionsDir()
	}
	return filepath.Join(root, "restore-points")
}

func restorePointPath(root, projectID, id string) (string, error) {
	if !aiSessionIDPattern.MatchString(id) {
		return "", failTool(aiCodeObjectNotFound, "there is no restore point with that id", "")
	}
	sum := sha256.Sum256([]byte(projectID))
	dir := filepath.Join(root, hex.EncodeToString(sum[:8]))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, id+".json"), nil
}

func (s *AIService) saveRestorePoint(projectID string, rp AIRestorePoint) error {
	path, err := restorePointPath(s.restoresDir(), projectID, rp.ID)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(rp, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *AIService) loadRestorePoint(projectID, id string) (AIRestorePoint, error) {
	path, err := restorePointPath(s.restoresDir(), projectID, id)
	if err != nil {
		return AIRestorePoint{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AIRestorePoint{}, failTool(aiCodeObjectNotFound, "there is no restore point with that id", "")
		}
		return AIRestorePoint{}, err
	}
	var rp AIRestorePoint
	if err := json.Unmarshal(raw, &rp); err != nil {
		return AIRestorePoint{}, failTool(aiCodeInternal, "the restore point file is damaged", "")
	}
	return rp, nil
}

func (s *AIService) listRestorePoints(projectID, env string) ([]AIRestorePoint, error) {
	sum := sha256.Sum256([]byte(projectID))
	dir := filepath.Join(s.restoresDir(), hex.EncodeToString(sum[:8]))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []AIRestorePoint{}, nil
		}
		return nil, err
	}
	out := make([]AIRestorePoint, 0, len(entries))
	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".json")
		if entry.IsDir() || !aiSessionIDPattern.MatchString(id) {
			continue
		}
		rp, err := s.loadRestorePoint(projectID, id)
		if err != nil {
			continue
		}
		if env != "" && !strings.EqualFold(rp.Env, env) {
			continue
		}
		rp.Catalog = nil
		out = append(out, rp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

func (s *AIService) pruneRestorePoints(projectID, env string) {
	all, err := s.listRestorePoints(projectID, env)
	if err != nil || len(all) <= aiMaxRestorePointsPerEnv {
		return
	}
	cutoff := time.Now().UTC().Add(-30 * 24 * time.Hour)
	for i := aiMaxRestorePointsPerEnv; i < len(all); i++ {
		rp := all[i]
		if rp.ProposalID != "" {
			created, parseErr := time.Parse(time.RFC3339, rp.CreatedAt)
			if parseErr == nil && created.After(cutoff) {
				continue
			}
		}
		path, pathErr := restorePointPath(s.restoresDir(), projectID, rp.ID)
		if pathErr == nil {
			_ = os.Remove(path)
		}
	}
}

func (s *AIService) captureRestorePoint(ctx context.Context, env *resolvedEnv, label, source, proposalID string) (AIRestorePoint, error) {
	projectID, err := s.projectID()
	if err != nil {
		return AIRestorePoint{}, failTool(aiCodeNotConnected, "no project is open", "")
	}
	catalog, err := loadCatalogForEnv(ctx, s, env, env.Schema)
	if err != nil {
		return AIRestorePoint{}, err
	}
	raw, err := json.Marshal(catalog)
	if err != nil {
		return AIRestorePoint{}, err
	}
	sum := sha256.Sum256(raw)
	id, err := newAIRandomID()
	if err != nil {
		return AIRestorePoint{}, err
	}
	if utf8.RuneCountInString(label) > 80 {
		label = string([]rune(label)[:80])
	}
	rp := AIRestorePoint{
		ID:         id,
		Env:        env.Key,
		Label:      label,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		Source:     source,
		ProposalID: proposalID,
		Scope:      "schema",
		ObjectCounts: AIRestoreObjectCounts{
			Tables: len(catalog.Tables), Views: len(catalog.Views),
			Indexes: len(catalog.Indexes), Constraints: len(catalog.Constraints),
			Routines: len(catalog.Routines),
		},
		SchemaHash: hex.EncodeToString(sum[:]),
		SizeBytes:  len(raw),
		Driver:     env.Driver,
		Database:   env.Database,
		Schema:     env.Schema,
		Catalog:    raw,
	}
	if err := s.saveRestorePoint(projectID, rp); err != nil {
		return AIRestorePoint{}, err
	}
	s.pruneRestorePoints(projectID, env.Key)
	return rp, nil
}

var aiCreateRestorePointTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "create_restore_point",
		Description: "Save a local schema snapshot of an environment. Does not write to the database. Cannot capture table data.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"Required."},` +
			`"label":{"type":"string"},` +
			`"schema":{"type":"string"},` +
			`"scope":{"type":"string","enum":["schema","data"],"description":"data is refused over MCP."}` +
			`},"required":["env"],"additionalProperties":false}`),
	},
	group:   aiGroupChanges,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Create a restore point" },
	live:    createRestorePointTool,
}

var aiListRestorePointsTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "list_restore_points",
		Description: "List saved schema restore points of the open project.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string"},` +
			`"limit":{"type":"integer","minimum":1,"maximum":50}` +
			`},"additionalProperties":false}`),
	},
	group:   aiGroupChanges,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "List restore points" },
	live:    listRestorePointsTool,
}

var aiPreviewRollbackTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "preview_rollback",
		Description: "Show what restoring a schema snapshot would change. Does not execute.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"id":{"type":"string"}` +
			`},"required":["id"],"additionalProperties":false}`),
	},
	group: aiGroupChanges,
	label: func(json.RawMessage) string { return "Preview a rollback" },
	live:  previewRollbackTool,
}

func createRestorePointTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env    string `json:"env"`
		Label  string `json:"label"`
		Schema string `json:"schema"`
		Scope  string `json:"scope"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.Env) == "" {
		return nil, failTool(aiCodeEnvRequired, "env is required", "")
	}
	if strings.EqualFold(in.Scope, "data") {
		return nil, failTool(aiCodePermissionDenied, "data restore points cannot be created through MCP", "Create a data restore point in Zentro.")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()
	if in.Schema != "" {
		env.Schema = in.Schema
	}
	rp, err := s.captureRestorePoint(ctx, env, in.Label, "mcp", "")
	if err != nil {
		return nil, err
	}
	rp.Catalog = nil
	return aiEnvMetaOverride{Data: rp, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: env.Schema}, nil
}

func listRestorePointsTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env   string `json:"env"`
		Limit int    `json:"limit"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "")
	}
	all, err := s.listRestorePoints(projectID, in.Env)
	if err != nil {
		return nil, err
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if len(all) > limit {
		all = all[:limit]
	}
	return all, nil
}

func previewRollbackTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(args, &in); err != nil || in.ID == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the restore point id", "")
	}
	if err := s.requireChangesAllowed(); err != nil {
		return nil, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "")
	}
	rp, err := s.loadRestorePoint(projectID, in.ID)
	if err != nil {
		return nil, err
	}
	if msg, hint, denied := mcpToolDeniedByDriver("preview_rollback", rp.Driver); denied {
		return nil, failTool(aiCodeUnsupportedDriver, msg, hint)
	}
	env, err := s.resolveEnv(ctx, rp.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()
	current, err := loadCatalogForEnv(ctx, s, env, env.Schema)
	if err != nil {
		return nil, err
	}
	var saved ai.Catalog
	if err := json.Unmarshal(rp.Catalog, &saved); err != nil {
		return nil, failTool(aiCodeInternal, "the restore point catalog is damaged", "")
	}
	dataLoss := namesOnlyIn(current, saved)
	notRestored := namesOnlyIn(saved, current)
	out := struct {
		From            string   `json:"from"`
		To              string   `json:"to"`
		DataLoss        []string `json:"dataLoss"`
		DataNotRestored []string `json:"dataNotRestored"`
		DataRestorable  []string `json:"dataRestorable"`
	}{From: rp.CreatedAt, To: env.Key, DataLoss: dataLoss, DataNotRestored: notRestored, DataRestorable: rp.DataTables}
	return aiEnvMetaOverride{
		Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: env.Schema,
		Warnings: mcpDriverWarnings("preview_rollback", env.Driver),
	}, nil
}

func namesOnlyIn(a, b ai.Catalog) []string {
	have := map[string]struct{}{}
	for _, t := range b.Tables {
		have[t.Name] = struct{}{}
	}
	var out []string
	for _, t := range a.Tables {
		if _, ok := have[t.Name]; !ok {
			out = append(out, t.Name)
		}
	}
	return out
}
