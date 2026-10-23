// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/driver"
	"zentro/internal/models"
)

const maxDependencyNodes = 200

func (d *MSSQLDriver) ReadDependencies(ctx context.Context, sqlDB *sql.DB, schema string, q models.MCPDependencyQuery) (models.MCPDependencyGraph, error) {
	kind, err := mssqlObjectKind(ctx, sqlDB, schema, q.Object)
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
			if wantDependents || wantDependencies {
				if cur.kind == "table" || cur.kind == "view" {
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
			}
			if wantDependents {
				deps, depErr := mssqlSQLDependents(ctx, sqlDB, schema, cur.name)
				if depErr != nil {
					return models.MCPDependencyGraph{}, depErr
				}
				for _, dep := range deps {
					via := "view"
					if dep.kind == "routine" {
						via = "trigger"
					}
					addEdge(dep.name, cur.name, via)
					if addNode(dep.kind, dep.name) {
						next = append(next, item{dep.kind, dep.name})
					}
				}
			}
			if wantDependencies {
				bases, baseErr := mssqlSQLDependencies(ctx, sqlDB, schema, cur.name)
				if baseErr != nil {
					return models.MCPDependencyGraph{}, baseErr
				}
				for _, b := range bases {
					addEdge(cur.name, b.name, "view")
					if addNode(b.kind, b.name) {
						next = append(next, item{b.kind, b.name})
					}
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

func mssqlObjectKind(ctx context.Context, sqlDB *sql.DB, schema, name string) (string, error) {
	var typ string
	err := sqlDB.QueryRowContext(ctx, `
		SELECT o.type FROM sys.objects o
		INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
		WHERE s.name = @p1 AND o.name = @p2
	`, sql.Named("p1", schema), sql.Named("p2", name)).Scan(&typ)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("there is no object named %q: %w", name, driver.ErrObjectNotFound)
	}
	if err != nil {
		return "", err
	}
	switch strings.TrimSpace(strings.ToUpper(typ)) {
	case "V":
		return "view", nil
	case "P", "FN", "IF", "TF":
		return "routine", nil
	case "TR":
		return "trigger", nil
	default:
		return "table", nil
	}
}

type mssqlDep struct{ kind, name string }

func mssqlSQLDependents(ctx context.Context, sqlDB *sql.DB, schema, name string) ([]mssqlDep, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT COALESCE(so.type, 'U'), OBJECT_NAME(d.referencing_id)
		FROM sys.sql_expression_dependencies d
		INNER JOIN sys.objects o ON o.object_id = d.referenced_id
		INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
		LEFT JOIN sys.objects so ON so.object_id = d.referencing_id
		WHERE s.name = @p1 AND o.name = @p2 AND OBJECT_NAME(d.referencing_id) IS NOT NULL
	`, sql.Named("p1", schema), sql.Named("p2", name))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMSSQLDeps(rows)
}

func mssqlSQLDependencies(ctx context.Context, sqlDB *sql.DB, schema, name string) ([]mssqlDep, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT COALESCE(ro.type, 'U'), d.referenced_entity_name
		FROM sys.sql_expression_dependencies d
		INNER JOIN sys.objects o ON o.object_id = d.referencing_id
		INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
		LEFT JOIN sys.objects ro ON ro.object_id = d.referenced_id
		WHERE s.name = @p1 AND o.name = @p2 AND d.referenced_entity_name IS NOT NULL
	`, sql.Named("p1", schema), sql.Named("p2", name))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMSSQLDeps(rows)
}

func scanMSSQLDeps(rows *sql.Rows) ([]mssqlDep, error) {
	var out []mssqlDep
	for rows.Next() {
		var typ, name string
		if err := rows.Scan(&typ, &name); err != nil {
			return nil, err
		}
		kind := "table"
		switch strings.TrimSpace(strings.ToUpper(typ)) {
		case "V":
			kind = "view"
		case "P", "FN", "IF", "TF":
			kind = "routine"
		case "TR":
			kind = "trigger"
		}
		out = append(out, mssqlDep{kind: kind, name: name})
	}
	return out, rows.Err()
}
