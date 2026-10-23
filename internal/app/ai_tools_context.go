// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/extensions/ai"
	"zentro/internal/extensions/querystat"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// The context tools tell a model about the app around the database: which
// project is open, which environments exist, what each one allows. They return
// no schema, so they keep working when the active environment is production,
// and they return no secret. What they may return is listed in ai_context.go.

const aiListLimit = 50

var aiContextTools = []aiTool{
	{
		spec: ai.ToolSpec{
			Name:        "get_app_context",
			Description: "What Zentro has open right now: the app version and plan, the project, the active environment, the connection name and driver, the database and schema, and the safety rules of that environment. Call it first when the answer depends on where the user is working.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "Read the app context" },
		live:  getAppContextTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "list_projects",
			Description: "The projects on this computer: id, name, tags, when each was last opened, how many environments it has, and which one is open. No paths and no editor content.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "List the projects" },
		live:  listProjectsTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "list_environments",
			Description: "The environments of a project (dev, sta, pro): which connection and database each one is bound to, its schema, and its safety rules (row cap, timeout, strictness). Defaults to the open project.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"project":{"type":"string","description":"A project id from list_projects. Defaults to the open project."}` +
				`},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "List the environments" },
		live:  listEnvironmentsTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "list_connections",
			Description: "The saved connections: id, name, driver, SSL mode, and which environments of the open project use each. Host, port, and user name are included only when the user allowed connection details. Never a password.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "List the connections" },
		live:  listConnectionsTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "list_scripts",
			Description: "The saved scripts of a connection in the open project: id, name, and when each changed. Names only, no SQL text. Use get_definition to read one when the user allowed object text.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"connection":{"type":"string","description":"A connection name from list_environments. Defaults to the active connection."}` +
				`},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "List the saved scripts" },
		live:  listScriptsTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "list_audit",
			Description: "Recent runs from the query history: when, which connection and environment, how long, how many rows, the risk level, and whether it failed. No SQL text and no error text. Use it to see how the user has been working.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"limit":{"type":"integer","description":"How many runs, newest first. Defaults to 20, at most 50."},` +
				`"environment":{"type":"string","description":"Only runs in this environment key, for example pro."},` +
				`"failedOnly":{"type":"boolean","description":"Only runs that failed."}` +
				`},"additionalProperties":false}`),
		},
		group: aiGroupAudit,
		label: func(json.RawMessage) string { return "Read the run history" },
		live:  listAuditTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "get_git_status",
			Description: "The change history of the open project: whether tracking is on, how many changes wait to be committed, and the latest commits (message, kind, time, how many files). No diffs, no paths, no authors.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"limit":{"type":"integer","description":"How many commits. Defaults to 10, at most 30."}` +
				`},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "Read the change history" },
		live:  getGitStatusTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "get_query_stats",
			Description: "Which query shapes run most and cost most, from this session: run counts, error counts, average and slowest times. Values in the SQL are already replaced with ?. Use it to find what to speed up.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"windowMinutes":{"type":"integer","description":"Only the last N minutes. 0 or missing means everything kept."},` +
				`"limit":{"type":"integer","description":"How many shapes in each list. Defaults to 5, at most 10."}` +
				`},"additionalProperties":false}`),
		},
		group: aiGroupContext,
		label: func(json.RawMessage) string { return "Read the query statistics" },
		live:  getQueryStatsTool,
	},
	{
		spec: ai.ToolSpec{
			Name:        "classify_sql",
			Description: "How risky a piece of SQL is, judged by Zentro's own write-safety rules under one environment's policy: which operations it holds, whether it updates or deletes without a WHERE, a verdict (allowed, needs_confirmation, or blocked) with the reasons, and suggestions for a safer form. It does not run the SQL and does not touch the database. Use it on SQL you wrote before suggesting it.",
			Parameters: json.RawMessage(`{"type":"object","properties":{` +
				`"sql":{"type":"string","description":"The SQL to classify. Use placeholders instead of real values."},` +
				`"env":{"type":"string","description":"Judge under this environment's policy, for example dev or pro. Defaults to the open environment."}` +
				`},"required":["sql"],"additionalProperties":false}`),
		},
		group: aiGroupMetadata,
		label: func(json.RawMessage) string { return "Classify some SQL" },
		live:  classifySQLTool,
	},
}

// aiRelationsTool reads the catalog like the other schema tools and asks the
// connection for the foreign keys.
var aiRelationsTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "list_relations",
		Description: "The foreign keys of one table in the active schema: the tables it points to and the tables that point to it, with the columns. Use it to find how to join two tables.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"table":{"type":"string","description":"The table name as search_schema returned it."},` +
			`"depth":{"type":"integer","minimum":1,"maximum":3,"description":"Follow foreign keys this many steps. Defaults to 1; above 1 the result also has a graph of tables and keys."},` +
			`"env":{"type":"string","description":"An environment key, for example dev or sta. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."}` +
			`},"required":["table"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label: func(args json.RawMessage) string {
		var in struct {
			Table string `json:"table"`
		}
		_ = json.Unmarshal(args, &in)
		return "Read the relations of " + strings.TrimSpace(in.Table)
	},
	live: listRelationsTool,
}

// isoTime passes a timestamp on only in RFC 3339 form. Other shapes are dropped:
// a bare run of digits and dashes looks like a phone number to the scanner that
// guards every result, and the model gains nothing from it.
func isoTime(value string) string {
	if _, err := time.Parse(time.RFC3339, value); err != nil {
		return ""
	}
	return value
}

func jsonData(value any) (json.RawMessage, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("the result could not be written")
	}
	return json.RawMessage(raw), nil
}

func (s *AIService) contextSource() (aiContextSource, error) {
	if s.source == nil {
		return aiContextSource{}, fmt.Errorf("the app context is not available")
	}
	return *s.source, nil
}

func (s *AIService) openProject() *models.Project {
	if s.project == nil {
		return nil
	}
	return s.project()
}

func getAppContextTool(_ context.Context, s *AIService, _ ai.Catalog, _ json.RawMessage) (any, error) {
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	out := aiAppContextDTO{}
	if src.appInfo != nil {
		info := src.appInfo()
		out.Version, out.Channel, out.OS = info.Version, info.Channel, info.OS
		out.Plan, out.PlanStatus, out.ViewMode = info.Plan, info.PlanStatus, info.ViewMode
	}
	project := s.openProject()
	if project != nil {
		out.Project = &aiProjectRefDTO{ID: project.ID, Name: project.Name}
	}
	env := s.envKey()
	out.Environment = env
	if profile := s.currentProfile(); profile != nil {
		out.Connection, out.Driver = profile.Name, profile.Driver
	}
	out.Schema = publicSchemaName(s.currentSchema())
	if project != nil {
		for _, item := range project.Environments {
			if strings.EqualFold(string(item.Key), env) {
				out.Database = publicSchemaName(item.LastDatabase)
			}
		}
	}
	if src.policy != nil && env != "" {
		policy := policyDTO(src.policy(env))
		out.Policy = &policy
	}
	return jsonData(out)
}

func listProjectsTool(_ context.Context, s *AIService, _ ai.Catalog, _ json.RawMessage) (any, error) {
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	if src.projects == nil {
		return "", fmt.Errorf("the project list is not available")
	}
	projects, err := src.projects()
	if err != nil {
		return "", fmt.Errorf("the projects could not be read")
	}
	activeID := ""
	if open := s.openProject(); open != nil {
		activeID = open.ID
	}
	out := make([]aiProjectDTO, 0, len(projects))
	for _, project := range projects {
		if project == nil {
			continue
		}
		tags := project.Tags
		if tags == nil {
			tags = []string{}
		}
		out = append(out, aiProjectDTO{
			ID:           project.ID,
			Name:         project.Name,
			Tags:         tags,
			LastOpenedAt: isoTime(project.LastOpenedAt),
			Environments: len(project.Environments),
			Active:       project.ID == activeID,
		})
	}
	if len(out) > aiListLimit {
		out = out[:aiListLimit]
	}
	return jsonData(out)
}

func listEnvironmentsTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Project string `json:"project"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	open := s.openProject()
	project := open
	if id := strings.TrimSpace(in.Project); id != "" && (open == nil || open.ID != id) {
		project = nil
		if src.projects != nil {
			projects, listErr := src.projects()
			if listErr != nil {
				return "", fmt.Errorf("the projects could not be read")
			}
			for _, item := range projects {
				if item != nil && item.ID == id {
					project = item
				}
			}
		}
		if project == nil {
			return "", failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no project with id %q", id), "Use list_projects to find it.")
		}
	}
	if project == nil {
		return "", failTool(aiCodeNotConnected, "no project is open", "Open a project in Zentro, or pass a project id from list_projects.")
	}
	active := ""
	if open != nil && open.ID == project.ID {
		active = s.envKey()
	}
	return jsonData(environmentDTOs(project, active, src.connectionNames(), src))
}

func listConnectionsTool(_ context.Context, s *AIService, _ ai.Catalog, _ json.RawMessage) (any, error) {
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	if src.connections == nil {
		return "", fmt.Errorf("the connection list is not available")
	}
	withDetails := false
	if settings, _, readErr := s.readSettings(); readErr == nil {
		withDetails = settings.IncludeConnectionDetails
	}
	bound := map[string][]string{}
	if open := s.openProject(); open != nil {
		for _, env := range open.Environments {
			if env.ConnectionRef != "" {
				bound[env.ConnectionRef] = append(bound[env.ConnectionRef], string(env.Key))
			}
		}
	}
	activeID := ""
	if profile := s.currentProfile(); profile != nil {
		activeID = profile.ID
	}
	out := make([]aiConnectionDTO, 0)
	for _, profile := range src.connections() {
		if profile == nil {
			continue
		}
		item := aiConnectionDTO{
			ID:      profile.ID,
			Name:    profile.Name,
			Driver:  profile.Driver,
			SSLMode: profile.SSLMode,
			Active:  profile.ID == activeID,
			BoundTo: bound[profile.ID],
		}
		if item.BoundTo == nil {
			item.BoundTo = []string{}
		}
		if withDetails {
			item.Details = &aiConnectionDetails{Host: profile.Host, Port: profile.Port, Username: profile.Username}
			if profile.Driver == constant.DriverSQLite {
				item.Details.File = filepath.Base(profile.DBName)
			}
		}
		out = append(out, item)
	}
	if len(out) > aiListLimit {
		out = out[:aiListLimit]
	}
	return jsonData(out)
}

func listScriptsTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Connection string `json:"connection"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	open := s.openProject()
	if src.scriptList == nil || open == nil {
		return "", failTool(aiCodeNotConnected, "no project is open", "Open a project in Zentro.")
	}
	name := strings.TrimSpace(in.Connection)
	if name == "" {
		if profile := s.currentProfile(); profile != nil {
			name = profile.Name
		}
	}
	if name == "" {
		return "", failTool(aiCodeNotConnected, "no connection is active", "Pass a connection name from list_environments.")
	}
	items, err := src.scriptList(open.ID, name)
	if err != nil {
		return "", fmt.Errorf("the scripts could not be read")
	}
	out := make([]aiScriptDTO, 0, len(items))
	for _, item := range items {
		out = append(out, aiScriptDTO{ID: item.ID, Name: item.Name, Connection: item.ConnectionName, UpdatedAt: isoTime(item.UpdatedAt)})
	}
	if len(out) > aiListLimit {
		out = out[:aiListLimit]
	}
	return jsonData(out)
}

// classifySQLTool never opens a connection: env only picks the policy (and
// the tokenizer's dialect), so it has no envArgs and is not held to the
// production rule, the same as before env existed.
func classifySQLTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		SQL string `json:"sql"`
		Env string `json:"env"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return "", failTool(aiCodeInvalidArgument, "pass the SQL to classify in the sql argument", "")
	}
	envKey, driver, err := s.classifyTarget(strings.TrimSpace(in.Env))
	if err != nil {
		return nil, err
	}
	var policy ExecutionPolicy
	if src, srcErr := s.contextSource(); srcErr == nil && src.policy != nil {
		policy = src.policy(envKey)
	} else {
		policy = resolveExecutionPolicy(utils.Preferences{}, envKey)
	}
	result := classifyForEnv(in.SQL, driver, policy)
	operations := make([]string, 0, len(result.Risk.Operations))
	for _, op := range result.Risk.Operations {
		operations = append(operations, string(op))
	}
	out := aiSQLRiskDTO{
		Statements:       len(result.Risk.Statements),
		Operations:       operations,
		HasWrite:         result.Risk.HasWrite,
		HasDestructive:   result.Risk.HasDestructive,
		HasUpdateNoWhere: result.Risk.HasUpdateNoWhere,
		HasDeleteNoWhere: result.Risk.HasDeleteNoWhere,
		Env:              envKey,
		Verdict:          result.Verdict,
		Reasons:          result.Reasons,
		Suggestions:      result.Suggestions,
	}
	if out.Reasons == nil {
		out.Reasons = []aiClassifyReasonDTO{}
	}
	if out.Suggestions == nil {
		out.Suggestions = []aiClassifySuggestionDTO{}
	}
	return jsonData(out)
}

// classifyTarget resolves the env classify_sql judges under, and the
// dialect of its connection, without opening anything. A named env must
// exist in the open project.
func (s *AIService) classifyTarget(envArg string) (envKey, driver string, err error) {
	if envArg == "" || strings.EqualFold(envArg, s.envKey()) {
		if profile := s.currentProfile(); profile != nil {
			driver = profile.Driver
		}
		return s.envKey(), driver, nil
	}
	project := s.openProject()
	if project == nil {
		return "", "", failTool(aiCodeNotConnected, "no project is open", "Open a project in Zentro.")
	}
	for _, env := range project.Environments {
		if !strings.EqualFold(string(env.Key), envArg) {
			continue
		}
		load := utils.LoadConnections
		if s.loadConnectionsFn != nil {
			load = s.loadConnectionsFn
		}
		if env.ConnectionRef != "" {
			if profiles, loadErr := load(); loadErr == nil {
				for _, p := range profiles {
					if p != nil && p.ID == env.ConnectionRef {
						driver = p.Driver
					}
				}
			}
		}
		return string(env.Key), driver, nil
	}
	return "", "", failTool(aiCodeEnvNotFound, fmt.Sprintf("there is no environment named %q", envArg), "Use list_environments to see the environments of this project.")
}

const (
	aiRelationsMaxDepth = 3
	// aiRelationsMaxNodes caps the graph so depth 3 on a hub table stays
	// small enough to read.
	aiRelationsMaxNodes = 60
)

// aiRelationsGraphDTO is list_relations' graph when depth is above 1: every
// table reached and every foreign key between them, child to parent.
type aiRelationsGraphDTO struct {
	Nodes []string             `json:"nodes"`
	Edges []aiRelationsEdgeDTO `json:"edges"`
}

type aiRelationsEdgeDTO struct {
	Constraint string `json:"constraint"`
	From       string `json:"from"`
	To         string `json:"to"`
}

// aiRelationsDepthDTO is the result for depth above 1. Depth 1 keeps the
// bare array every earlier call received.
type aiRelationsDepthDTO struct {
	Relations []aiRelationDTO     `json:"relations"`
	Graph     aiRelationsGraphDTO `json:"graph"`
}

func listRelationsTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Table  string `json:"table"`
		Depth  *int   `json:"depth"`
		Env    string `json:"env"`
		Schema string `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	depth := 1
	if in.Depth != nil {
		if *in.Depth < 1 || *in.Depth > aiRelationsMaxDepth {
			return nil, failTool(aiCodeInvalidArgument, fmt.Sprintf("depth must be between 1 and %d", aiRelationsMaxDepth), "")
		}
		depth = *in.Depth
	}
	scope, err := s.openCatalogScope(ctx, in.Env, in.Schema)
	if err != nil {
		return nil, err
	}
	defer scope.Close()
	catalog := scope.Catalog
	name := strings.TrimSpace(in.Table)
	if dot := strings.LastIndex(name, "."); dot >= 0 && strings.EqualFold(name[:dot], catalog.Schema) {
		name = name[dot+1:]
	}
	table, ok := findTable(catalog, name)
	if !ok {
		return nil, failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no table named %q in schema %s; use search_schema to find it", in.Table, catalog.Schema), didYouMeanHint(nearestNames(name, tableNames(catalog), 3), ""))
	}
	fetch, err := s.relationsFetcher(scope)
	if err != nil {
		return nil, err
	}
	rels, err := fetch(ctx, catalog.Schema, table.Name)
	if err != nil {
		return "", fmt.Errorf("the relations could not be read")
	}
	out := relationDTOs(rels, table.Name, catalog.Schema)
	if depth == 1 {
		raw, err := jsonData(out)
		if err != nil {
			return nil, err
		}
		return scope.result(raw), nil
	}

	graph, truncated, err := walkRelations(ctx, fetch, catalog.Schema, table.Name, rels, depth)
	if err != nil {
		return "", fmt.Errorf("the relations could not be read")
	}
	result := scope.result(aiRelationsDepthDTO{Relations: out, Graph: graph})
	if truncated {
		result.Truncated = true
		result.Warnings = append(result.Warnings, fmt.Sprintf("The graph stopped at %d tables; lower depth to see a smaller part.", aiRelationsMaxNodes))
	}
	return result, nil
}

type aiRelationsFetch func(ctx context.Context, schema, table string) ([]models.TableRelationship, error)

// relationsFetcher reads foreign keys through the app's own connection
// service for the open connection, and through the driver's SchemaFetcher
// for an environment opened for this call.
func (s *AIService) relationsFetcher(scope *aiCatalogScope) (aiRelationsFetch, error) {
	if scope.Ambient {
		src, err := s.contextSource()
		if err != nil {
			return nil, err
		}
		if src.relationships == nil {
			return nil, failTool(aiCodeUnsupportedDriver, "this connection cannot list relations", "")
		}
		return src.relationships, nil
	}
	drv, ok := core.Get(scope.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", scope.Driver), "")
	}
	return func(ctx context.Context, schema, table string) ([]models.TableRelationship, error) {
		return drv.FetchTableRelationships(ctx, scope.DB, schema, table)
	}, nil
}

func relationDTOs(rels []models.TableRelationship, table, schema string) []aiRelationDTO {
	out := make([]aiRelationDTO, 0, len(rels))
	for _, rel := range rels {
		item := aiRelationDTO{
			Constraint:   rel.ConstraintName,
			FromTable:    rel.SourceTable,
			FromColumn:   rel.SourceColumn,
			ToTable:      rel.TargetTable,
			ToColumn:     rel.TargetColumn,
			OnDelete:     rel.OnDelete,
			OnUpdate:     rel.OnUpdate,
			Deferrable:   rel.Deferrable,
			TableIsChild: strings.EqualFold(rel.SourceTable, table),
		}
		other := rel.SourceSchema
		if item.TableIsChild {
			other = rel.TargetSchema
		}
		if !strings.EqualFold(other, schema) {
			item.OtherSchema = publicSchemaName(other)
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Constraint < out[j].Constraint })
	return out
}

// walkRelations follows foreign keys in both directions from root, depth
// steps, staying in schema, and stops adding tables at aiRelationsMaxNodes.
// rootRels are root's own keys, already read.
func walkRelations(ctx context.Context, fetch aiRelationsFetch, schema, root string, rootRels []models.TableRelationship, depth int) (aiRelationsGraphDTO, bool, error) {
	graph := aiRelationsGraphDTO{Nodes: []string{root}, Edges: []aiRelationsEdgeDTO{}}
	seen := map[string]bool{strings.ToLower(root): true}
	seenEdge := map[string]bool{}
	truncated := false
	frontier := []string{root}
	for level := 0; level < depth && len(frontier) > 0; level++ {
		var next []string
		for _, table := range frontier {
			rels := rootRels
			if level > 0 {
				var err error
				if rels, err = fetch(ctx, schema, table); err != nil {
					return graph, false, err
				}
			}
			for _, rel := range rels {
				if !strings.EqualFold(rel.SourceSchema, schema) || !strings.EqualFold(rel.TargetSchema, schema) {
					continue
				}
				for _, neighbor := range []string{rel.SourceTable, rel.TargetTable} {
					if seen[strings.ToLower(neighbor)] {
						continue
					}
					if len(graph.Nodes) >= aiRelationsMaxNodes {
						truncated = true
						continue
					}
					seen[strings.ToLower(neighbor)] = true
					graph.Nodes = append(graph.Nodes, neighbor)
					next = append(next, neighbor)
				}
				if !seen[strings.ToLower(rel.SourceTable)] || !seen[strings.ToLower(rel.TargetTable)] {
					continue
				}
				key := rel.ConstraintName + "\x00" + rel.SourceTable + "\x00" + rel.TargetTable
				if !seenEdge[key] {
					seenEdge[key] = true
					graph.Edges = append(graph.Edges, aiRelationsEdgeDTO{Constraint: rel.ConstraintName, From: rel.SourceTable, To: rel.TargetTable})
				}
			}
		}
		frontier = next
	}
	return graph, truncated, nil
}

// boundedLimit reads an optional limit argument and keeps it in 1..max.
func boundedLimit(value, fallback, max int) int {
	if value <= 0 {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}

// shortText cuts a line a user or a tool wrote to n runes, so one long message
// cannot fill a result.
func shortText(text string, n int) string {
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) <= n {
		return text
	}
	return string(runes[:n]) + "..."
}

func listAuditTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Limit       int    `json:"limit"`
		Environment string `json:"environment"`
		FailedOnly  bool   `json:"failedOnly"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	if src.audit == nil {
		return "", fmt.Errorf("the run history is not available")
	}
	limit := boundedLimit(in.Limit, 20, aiListLimit)
	// Ask for more than needed: the filters below drop rows after the read.
	entries, err := src.audit(aiListLimit * 4)
	if err != nil {
		return "", fmt.Errorf("the run history could not be read")
	}
	out := make([]aiAuditDTO, 0, limit)
	for _, entry := range entries {
		if in.Environment != "" && !strings.EqualFold(entry.EnvKey, in.Environment) {
			continue
		}
		failed := entry.Error != ""
		if in.FailedOnly && !failed {
			continue
		}
		protections := entry.UsedProtectionLayers
		if protections == nil {
			protections = []string{}
		}
		out = append(out, aiAuditDTO{
			ExecutedAt:  isoTime(entry.ExecutedAt),
			Connection:  entry.Profile,
			Database:    publicSchemaName(entry.Database),
			Driver:      entry.Driver,
			Environment: entry.EnvKey,
			DurationMs:  entry.DurationMs,
			RowCount:    entry.RowCount,
			IsSelect:    entry.IsSelect,
			RiskLevel:   entry.RiskLevel,
			Failed:      failed,
			Protections: protections,
			Pinned:      entry.Pinned,
		})
		if len(out) == limit {
			break
		}
	}
	return jsonData(out)
}

func getGitStatusTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Limit int `json:"limit"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	if src.gitStatus == nil || src.gitTimeline == nil {
		return "", fmt.Errorf("the change history is not available")
	}
	status, err := src.gitStatus()
	if err != nil {
		return "", fmt.Errorf("the change history could not be read")
	}
	out := aiGitDTO{
		Enabled:        status.Enabled,
		Initialized:    status.Initialized,
		PendingChanges: status.PendingCount,
		HasError:       status.LastError != "",
		Recent:         []aiGitCommitDTO{},
	}
	if status.Initialized {
		items, timelineErr := src.gitTimeline(boundedLimit(in.Limit, 10, 30))
		if timelineErr != nil {
			return "", fmt.Errorf("the change history could not be read")
		}
		for _, item := range items {
			out.Recent = append(out.Recent, aiGitCommitDTO{
				Message: shortText(item.Message, 120),
				Kind:    item.EventType,
				When:    isoTime(item.When),
				Files:   len(item.Files),
			})
		}
	}
	return jsonData(out)
}

func patternDTOs(items []querystat.QueryPattern, limit int) []aiPatternDTO {
	out := make([]aiPatternDTO, 0, limit)
	for _, item := range items {
		out = append(out, aiPatternDTO{
			Pattern: shortText(item.NormalizedSQL, 200),
			Count:   item.ExecCount,
			Errors:  item.ErrorCount,
			AvgMs:   item.AvgMs,
			P95Ms:   item.P95Ms,
			TotalMs: item.TotalMs,
		})
		if len(out) == limit {
			break
		}
	}
	return out
}

func getQueryStatsTool(_ context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		WindowMinutes int `json:"windowMinutes"`
		Limit         int `json:"limit"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return "", failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	src, err := s.contextSource()
	if err != nil {
		return "", err
	}
	if src.queryStats == nil {
		return "", fmt.Errorf("the query statistics are not available")
	}
	limit := boundedLimit(in.Limit, 5, 10)
	window := in.WindowMinutes
	if window < 0 {
		window = 0
	}
	report := src.queryStats(window, limit)
	return jsonData(aiQueryStatsDTO{
		TotalRuns:   report.TotalExecs,
		ErrorRate:   report.ErrorRate,
		AvgMs:       report.AvgDurationMs,
		P95Ms:       report.P95DurationMs,
		WindowMins:  report.WindowMins,
		TopByImpact: patternDTOs(report.TopImpact, limit),
		TopByCount:  patternDTOs(report.TopFrequent, limit),
	})
}
