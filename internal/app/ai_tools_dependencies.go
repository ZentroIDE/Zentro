// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

// find_dependencies answers "what breaks if I change or drop this" from the
// catalog (spec section 3). Like the other read-and-check tools it resolves
// its own environment. It never returns a routine body, so it needs only
// the metadata group, not object_text.
var aiFindDependenciesTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "find_dependencies",
		Description: "What depends on a table, view, or routine (or on one column of it), or what it depends on, read from the catalog: foreign keys, views, triggers, indexes, and owned sequences, as a graph of nodes and edges. Routines whose body only mentions the name come back separately in possiblyDependent, since that is a text match, not a recorded dependency. Use it before suggesting a rename, a type change, or a drop.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"object":{"type":"string","description":"A table, view, or routine name as search_schema returned it."},` +
			`"column":{"type":"string","description":"Only consider dependencies on this one column of a table or view."},` +
			`"direction":{"type":"string","enum":["dependents","dependencies","both"],"description":"dependents (default) is what would break; dependencies is what this object needs."},` +
			`"depth":{"type":"integer","minimum":1,"maximum":5,"description":"How many hops to follow. Defaults to 2."},` +
			`"env":{"type":"string","description":"An environment key, for example dev or pro. Defaults to the open environment."},` +
			`"schema":{"type":"string","description":"Defaults to the active schema."}` +
			`},"required":["object"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"env"},
	label: func(args json.RawMessage) string {
		var in struct{ Object, Column string }
		_ = json.Unmarshal(args, &in)
		if in.Column != "" {
			return "Find what depends on " + in.Object + "." + in.Column
		}
		return "Find what depends on " + in.Object
	},
	live: findDependenciesTool,
}

const (
	aiDependencyDefaultDepth = 2
	aiDependencyMaxDepth     = 5
)

// aiDependencyNameMatchWarning is always present: a PL/pgSQL body's own
// references are invisible to the catalog, so the graph alone can miss them.
const aiDependencyNameMatchWarning = "Routine bodies are not tracked by the database's dependency catalog. possiblyDependent lists routines whose body mentions the name (strings and comments excluded); a match is a guess, and a routine that builds the name dynamically is not found at all."

type aiDependencyNodeDTO struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type aiDependencyEdgeDTO struct {
	From string `json:"from"`
	To   string `json:"to"`
	Via  string `json:"via"`
}

type aiPossibleDependencyDTO struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Confidence string `json:"confidence"`
}

// aiDependencyCountDTO is one row of summary: how many nodes of one kind the
// graph found, the root itself excluded.
type aiDependencyCountDTO struct {
	Kind  string `json:"kind"`
	Count int    `json:"count"`
}

type aiFindDependenciesDTO struct {
	Object            string                    `json:"object"`
	Kind              string                    `json:"kind"`
	Column            string                    `json:"column,omitempty"`
	Direction         string                    `json:"direction"`
	Depth             int                       `json:"depth"`
	Nodes             []aiDependencyNodeDTO     `json:"nodes"`
	Edges             []aiDependencyEdgeDTO     `json:"edges"`
	Summary           []aiDependencyCountDTO    `json:"summary"`
	PossiblyDependent []aiPossibleDependencyDTO `json:"possiblyDependent"`
}

func findDependenciesTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Object    string `json:"object"`
		Column    string `json:"column"`
		Direction string `json:"direction"`
		Depth     *int   `json:"depth"`
		Env       string `json:"env"`
		Schema    string `json:"schema"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.Object) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass the table, view, or routine in the object argument", "")
	}
	direction := in.Direction
	switch direction {
	case "":
		direction = "dependents"
	case "dependents", "dependencies", "both":
	default:
		return nil, failTool(aiCodeInvalidArgument, "direction must be dependents, dependencies, or both", "")
	}
	depth := aiDependencyDefaultDepth
	if in.Depth != nil {
		if *in.Depth < 1 || *in.Depth > aiDependencyMaxDepth {
			return nil, failTool(aiCodeInvalidArgument, fmt.Sprintf("depth must be between 1 and %d", aiDependencyMaxDepth), "")
		}
		depth = *in.Depth
	}

	env, err := s.resolveEnv(ctx, in.Env)
	if err != nil {
		return nil, err
	}
	defer env.Close()

	drv, ok := core.Get(env.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", env.Driver), "")
	}
	reader, ok := drv.(driverport.DependencyReader)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("find_dependencies does not support the %s driver yet", env.Driver), "")
	}

	schema := strings.TrimSpace(in.Schema)
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}

	catalog, err := s.loadCatalogFor(ctx, env.DB, &env.Profile, env.Key, schema, false, false)
	if err != nil {
		return nil, failTool(aiCodeInternal, "the schema could not be read: "+err.Error(), "")
	}
	object := canonicalObjectName(catalog, strings.TrimSpace(in.Object))
	column := strings.TrimSpace(in.Column)
	if column != "" {
		column = canonicalColumnName(catalog, object, column)
	}

	graph, err := reader.ReadDependencies(ctx, env.DB, schema, models.MCPDependencyQuery{
		Object: object, Column: column, Direction: direction, Depth: depth,
	})
	if errors.Is(err, driverport.ErrObjectNotFound) {
		return nil, dependencyNotFound(catalog, schema, object, column)
	}
	if err != nil {
		return nil, failTool(aiCodeInternal, "the dependencies could not be read", "")
	}

	out := buildDependenciesDTO(graph, object, column, direction, depth)
	warnings := []string{aiDependencyNameMatchWarning}
	if column != "" && direction != "dependents" {
		warnings = append(warnings, "column narrows foreign keys in both directions, but a view's own dependencies are always listed for the whole view.")
	}
	if graph.Truncated {
		warnings = append(warnings, "The graph stopped at its node limit; lower depth or pass column to narrow it.")
	}
	warnings = append(warnings, mcpDriverWarnings("find_dependencies", env.Driver)...)
	return aiEnvMetaOverride{
		Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema,
		Warnings: warnings, Truncated: graph.Truncated,
	}, nil
}

// buildDependenciesDTO turns the driver's graph into the tool's result and
// counts nodes by kind for summary. A name-matched routine is copied only
// into PossiblyDependent, never into Nodes or Edges.
func buildDependenciesDTO(graph models.MCPDependencyGraph, object, column, direction string, depth int) aiFindDependenciesDTO {
	out := aiFindDependenciesDTO{
		Object: object, Column: column, Direction: direction, Depth: depth,
		Nodes: []aiDependencyNodeDTO{}, Edges: []aiDependencyEdgeDTO{},
		Summary: []aiDependencyCountDTO{}, PossiblyDependent: []aiPossibleDependencyDTO{},
	}
	counts := map[string]int{}
	for i, n := range graph.Nodes {
		out.Nodes = append(out.Nodes, aiDependencyNodeDTO{Kind: n.Kind, Name: n.Name})
		if i == 0 {
			out.Kind = n.Kind // the driver always puts the root first
			continue
		}
		counts[n.Kind]++
	}
	for _, e := range graph.Edges {
		out.Edges = append(out.Edges, aiDependencyEdgeDTO{From: e.From, To: e.To, Via: e.Via})
	}
	for _, p := range graph.PossiblyDependent {
		out.PossiblyDependent = append(out.PossiblyDependent, aiPossibleDependencyDTO{Kind: p.Kind, Name: p.Name, Confidence: p.Confidence})
	}
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	for _, kind := range kinds {
		out.Summary = append(out.Summary, aiDependencyCountDTO{Kind: kind, Count: counts[kind]})
	}
	return out
}

// canonicalObjectName returns the catalog's own spelling of name when a
// table, view, or routine matches it case-insensitively, so "Orders" finds
// orders. Anything else is passed through for the driver to judge (a
// materialized view is not in this catalog but is still a valid object).
func canonicalObjectName(catalog ai.Catalog, name string) string {
	for _, candidate := range dependencyObjectNames(catalog) {
		if candidate == name {
			return candidate
		}
	}
	for _, candidate := range dependencyObjectNames(catalog) {
		if strings.EqualFold(candidate, name) {
			return candidate
		}
	}
	return name
}

func canonicalColumnName(catalog ai.Catalog, object, column string) string {
	table, ok := findTable(catalog, object)
	if !ok {
		return column
	}
	for _, c := range table.Columns {
		if c.Name == column {
			return c.Name
		}
	}
	for _, c := range table.Columns {
		if strings.EqualFold(c.Name, column) {
			return c.Name
		}
	}
	return column
}

func dependencyObjectNames(catalog ai.Catalog) []string {
	names := make([]string, 0, len(catalog.Tables)+len(catalog.Views)+len(catalog.Routines))
	for _, t := range catalog.Tables {
		names = append(names, t.Name)
	}
	for _, v := range catalog.Views {
		if !v.Missing {
			names = append(names, v.Name)
		}
	}
	for _, r := range catalog.Routines {
		if !r.Missing {
			names = append(names, r.Name)
		}
	}
	return names
}

// dependencyNotFound builds OBJECT_NOT_FOUND with a didYouMean hint: for the
// column when the object itself is known, otherwise for the object.
func dependencyNotFound(catalog ai.Catalog, schema, object, column string) error {
	if column != "" {
		if table, ok := findTable(catalog, object); ok {
			columns := make([]string, 0, len(table.Columns))
			for _, c := range table.Columns {
				columns = append(columns, c.Name)
			}
			return failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no column %q on %s", column, object), didYouMeanHint(nearestNames(column, columns, 3), "Use describe_table to list its columns."))
		}
	}
	return failTool(aiCodeObjectNotFound, fmt.Sprintf("there is no table, view, or routine named %q in schema %s", object, schema), didYouMeanHint(nearestNames(object, dependencyObjectNames(catalog), 3), "Use search_schema to find it."))
}

func didYouMeanHint(suggestions []string, fallback string) string {
	if len(suggestions) == 0 {
		return fallback
	}
	return "Did you mean: " + strings.Join(suggestions, ", ") + "?"
}
