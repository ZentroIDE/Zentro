// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

const maxDependencyNodes = 200

func (d *MySQLDriver) ReadDependencies(ctx context.Context, sqlDB *sql.DB, schema string, q models.MCPDependencyQuery) (models.MCPDependencyGraph, error) {
	kind, err := mysqlObjectKind(ctx, sqlDB, schema, q.Object)
	if err != nil {
		return models.MCPDependencyGraph{}, err
	}
	depth := q.Depth
	if depth <= 0 {
		depth = 2
	}
	if depth > 5 {
		depth = 5
	}
	direction := q.Direction
	if direction == "" {
		direction = "dependents"
	}
	wantDependents := direction == "dependents" || direction == "both"
	wantDependencies := direction == "dependencies" || direction == "both"

	graph := models.MCPDependencyGraph{Nodes: []models.MCPDependencyNode{{Kind: kind, Name: q.Object}}}
	seenNodes := map[string]bool{kind + "\x00" + q.Object: true}
	seenEdges := map[string]bool{}
	addNode := func(k, name string) bool {
		key := k + "\x00" + name
		if seenNodes[key] {
			return false
		}
		seenNodes[key] = true
		graph.Nodes = append(graph.Nodes, models.MCPDependencyNode{Kind: k, Name: name})
		return true
	}
	addEdge := func(from, to, via string) {
		key := from + "\x00" + to + "\x00" + via
		if seenEdges[key] {
			return
		}
		seenEdges[key] = true
		graph.Edges = append(graph.Edges, models.MCPDependencyEdge{From: from, To: to, Via: via})
	}

	type item struct{ kind, name string }
	frontier := []item{{kind, q.Object}}
	for level := 0; level < depth && len(frontier) > 0 && len(graph.Nodes) < maxDependencyNodes; level++ {
		var next []item
		for _, cur := range frontier {
			if cur.kind != "table" && cur.kind != "view" {
				continue
			}
			if wantDependents || wantDependencies {
				rels, relErr := d.FetchTableRelationships(ctx, sqlDB, schema, cur.name)
				if relErr != nil {
					return models.MCPDependencyGraph{}, relErr
				}
				for _, r := range rels {
					if wantDependents && strings.EqualFold(r.TargetTable, cur.name) {
						addEdge(r.SourceTable, cur.name, "fk")
						if addNode("table", r.SourceTable) {
							next = append(next, item{"table", r.SourceTable})
						}
					}
					if wantDependencies && strings.EqualFold(r.SourceTable, cur.name) {
						addEdge(cur.name, r.TargetTable, "fk")
						if addNode("table", r.TargetTable) {
							next = append(next, item{"table", r.TargetTable})
						}
					}
				}
			}
			if wantDependents {
				views, viewErr := mysqlViewsMentioning(ctx, sqlDB, schema, cur.name)
				if viewErr != nil {
					return models.MCPDependencyGraph{}, viewErr
				}
				for _, v := range views {
					addEdge(v, cur.name, "view")
					if addNode("view", v) {
						next = append(next, item{"view", v})
					}
				}
				triggers, trigErr := mysqlTriggersOn(ctx, sqlDB, schema, cur.name)
				if trigErr != nil {
					return models.MCPDependencyGraph{}, trigErr
				}
				for _, tr := range triggers {
					addNode("trigger", tr)
					addEdge(tr, cur.name, "trigger")
				}
			}
		}
		frontier = next
	}
	if len(graph.Nodes) >= maxDependencyNodes {
		graph.Truncated = true
	}
	return graph, nil
}

func mysqlObjectKind(ctx context.Context, sqlDB *sql.DB, schema, name string) (string, error) {
	var typ string
	err := sqlDB.QueryRowContext(ctx, `
		SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
	`, schema, name).Scan(&typ)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("there is no object named %q: %w", name, driver.ErrObjectNotFound)
	}
	if err != nil {
		return "", err
	}
	if strings.Contains(strings.ToUpper(typ), "VIEW") {
		return "view", nil
	}
	return "table", nil
}

func mysqlViewsMentioning(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]string, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	needle := strings.ToLower(table)
	var names []string
	for rows.Next() {
		var name, def string
		if err := rows.Scan(&name, &def); err != nil {
			return nil, err
		}
		if strings.Contains(strings.ToLower(def), needle) {
			names = append(names, name)
		}
	}
	return names, rows.Err()
}

func mysqlTriggersOn(ctx context.Context, sqlDB *sql.DB, schema, table string) ([]string, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
		WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
