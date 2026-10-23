// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"zentro/internal/db"
	"zentro/internal/driver"
	"zentro/internal/models"
)

// maxDependencyNodes caps the graph ReadDependencies returns, so a deep or
// wide object (depth 5 on a hub table) cannot return an unbounded result.
const maxDependencyNodes = 200

// ReadDependencies implements driver.DependencyReader for Postgres (spec
// section 3, find_dependencies). It walks breadth-first from the named
// object, up to q.Depth hops, through foreign keys (via "fk"), a view's
// rewrite rule (via "view", pg_rewrite and pg_depend), and a trigger's table
// and function (via "trigger", pg_trigger). The root object alone also gets
// its indexes (via "index") and the sequences it owns (via "ownership",
// pg_depend); repeating those for every table the walk reaches would bury
// the answer in noise. A routine root gets the triggers that call it.
//
// q.Column narrows the root's own edges to that one column: foreign keys
// on it, views that read it, indexes that cover it, the sequence it owns,
// and triggers declared UPDATE OF it. Hops past the root are always whole
// objects (a view that reads the column breaks as a whole).
//
// A PL/pgSQL routine's own body is never walked for real edges (Postgres
// does not record what it references in pg_depend either); it is only
// ever a possiblyDependent name match, never a node this graph expands
// from.
func (d *PostgresDriver) ReadDependencies(ctx context.Context, sqlDB *sql.DB, schema string, q models.MCPDependencyQuery) (models.MCPDependencyGraph, error) {
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

	rootKind, err := resolveObjectKind(ctx, sqlDB, schema, q.Object)
	if err != nil {
		return models.MCPDependencyGraph{}, err
	}
	rootAttnum := 0
	if q.Column != "" {
		if rootKind == "routine" {
			return models.MCPDependencyGraph{}, fmt.Errorf("a routine has no columns: %w", driver.ErrObjectNotFound)
		}
		if rootAttnum, err = columnAttnum(ctx, sqlDB, schema, q.Object, q.Column); err != nil {
			return models.MCPDependencyGraph{}, err
		}
	}

	graph := models.MCPDependencyGraph{
		Nodes: []models.MCPDependencyNode{{Kind: rootKind, Name: q.Object}},
	}
	seenNodes := map[string]bool{rootKind + "\x00" + q.Object: true}
	seenEdges := map[string]bool{}
	addNode := func(kind, name string) bool {
		key := kind + "\x00" + name
		if seenNodes[key] {
			return false
		}
		seenNodes[key] = true
		graph.Nodes = append(graph.Nodes, models.MCPDependencyNode{Kind: kind, Name: name})
		return true
	}
	addEdge := func(from, to, via string) {
		key := from + "\x00" + to + "\x00" + via
		if !seenEdges[key] {
			seenEdges[key] = true
			graph.Edges = append(graph.Edges, models.MCPDependencyEdge{From: from, To: to, Via: via})
		}
	}

	type frontierItem struct {
		kind, name string
		attnum     int // non-zero only for the root, when q.Column is set
	}
	frontier := []frontierItem{{rootKind, q.Object, rootAttnum}}
	column := strings.ToLower(q.Column)

	if rootKind == "routine" && wantDependents {
		triggers, err := triggersCallingRoutine(ctx, sqlDB, schema, q.Object)
		if err != nil {
			return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: routine triggers: %w", err)
		}
		for _, tr := range triggers {
			addNode("trigger", tr.name)
			addEdge(tr.name, q.Object, "trigger")
			addNode("table", tr.table)
			addEdge(tr.name, tr.table, "trigger")
		}
	}

	for level := 0; level < depth && len(frontier) > 0 && len(graph.Nodes) < maxDependencyNodes; level++ {
		var next []frontierItem
		for _, item := range frontier {
			if item.kind != "table" && item.kind != "view" {
				continue // routines and triggers are leaves in this graph
			}
			isRoot := level == 0
			if wantDependents || wantDependencies {
				rels, err := d.FetchTableRelationships(ctx, sqlDB, schema, item.name)
				if err != nil {
					return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: fk: %w", err)
				}
				for _, r := range rels {
					if wantDependents && strings.EqualFold(r.TargetTable, item.name) &&
						(item.attnum == 0 || strings.EqualFold(r.TargetColumn, column)) {
						addEdge(r.SourceTable, item.name, "fk")
						if addNode("table", r.SourceTable) {
							next = append(next, frontierItem{kind: "table", name: r.SourceTable})
						}
					}
					if wantDependencies && strings.EqualFold(r.SourceTable, item.name) &&
						(item.attnum == 0 || strings.EqualFold(r.SourceColumn, column)) {
						addEdge(item.name, r.TargetTable, "fk")
						if addNode("table", r.TargetTable) {
							next = append(next, frontierItem{kind: "table", name: r.TargetTable})
						}
					}
				}
			}
			if wantDependents {
				views, err := dependentViews(ctx, sqlDB, schema, item.name, item.attnum)
				if err != nil {
					return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: views: %w", err)
				}
				for _, v := range views {
					addEdge(v, item.name, "view")
					if addNode("view", v) {
						next = append(next, frontierItem{kind: "view", name: v})
					}
				}
				triggers, err := triggersOnTable(ctx, sqlDB, schema, item.name, item.attnum)
				if err != nil {
					return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: triggers: %w", err)
				}
				for _, tr := range triggers {
					addNode("trigger", tr.name)
					addEdge(tr.name, item.name, "trigger")
					addNode("routine", tr.function)
					addEdge(tr.name, tr.function, "trigger")
				}
				if isRoot && item.kind == "table" {
					indexes, err := indexesOnTable(ctx, sqlDB, schema, item.name, item.attnum)
					if err != nil {
						return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: indexes: %w", err)
					}
					for _, ix := range indexes {
						addNode("index", ix)
						addEdge(ix, item.name, "index")
					}
					sequences, err := ownedSequences(ctx, sqlDB, schema, item.name, item.attnum)
					if err != nil {
						return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: sequences: %w", err)
					}
					for _, seq := range sequences {
						addNode("sequence", seq)
						addEdge(seq, item.name, "ownership")
					}
				}
			}
			if wantDependencies && item.kind == "view" {
				bases, err := viewBaseTables(ctx, sqlDB, schema, item.name)
				if err != nil {
					return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: view bases: %w", err)
				}
				for _, base := range bases {
					addEdge(item.name, base, "view")
					if addNode("table", base) {
						next = append(next, frontierItem{kind: "table", name: base})
					}
				}
			}
			if len(graph.Nodes) >= maxDependencyNodes {
				break
			}
		}
		frontier = next
	}
	if len(graph.Nodes) >= maxDependencyNodes {
		graph.Truncated = true
		graph.Nodes = graph.Nodes[:maxDependencyNodes]
	}

	possible, err := possiblyDependentRoutines(ctx, sqlDB, schema, q.Object, q.Column, graph.Nodes)
	if err != nil {
		return models.MCPDependencyGraph{}, fmt.Errorf("postgres: dependencies: possibly dependent: %w", err)
	}
	graph.PossiblyDependent = possible

	return graph, nil
}

// resolveObjectKind looks up whether object is a table, a view, or a
// routine, so the graph's root node is labeled correctly and the walk knows
// which relationships apply to it. An unknown name wraps
// driver.ErrObjectNotFound; the tool layer adds the didYouMean suggestion
// from its already-loaded catalog.
func resolveObjectKind(ctx context.Context, sqlDB *sql.DB, schema, object string) (string, error) {
	var relkind string
	err := sqlDB.QueryRowContext(ctx,
		`SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2`,
		schema, object,
	).Scan(&relkind)
	if err == nil {
		switch relkind {
		case "v", "m":
			return "view", nil
		default:
			return "table", nil
		}
	}
	if err != sql.ErrNoRows {
		return "", fmt.Errorf("postgres: dependencies: resolve kind: %w", err)
	}

	var exists bool
	if err := sqlDB.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.proname = $2)`,
		schema, object,
	).Scan(&exists); err != nil {
		return "", fmt.Errorf("postgres: dependencies: resolve kind: %w", err)
	}
	if exists {
		return "routine", nil
	}
	return "", fmt.Errorf("there is no table, view, or routine named %q: %w", object, driver.ErrObjectNotFound)
}

// columnAttnum finds column's attribute number on relation, which is how
// pg_depend, pg_index, and pg_trigger refer to a column.
func columnAttnum(ctx context.Context, sqlDB *sql.DB, schema, relation, column string) (int, error) {
	var attnum int
	err := sqlDB.QueryRowContext(ctx, `
		SELECT a.attnum
		FROM pg_attribute a
		JOIN pg_class c ON c.oid = a.attrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3
		  AND a.attnum > 0 AND NOT a.attisdropped
	`, schema, relation, column).Scan(&attnum)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("there is no column %q on %q: %w", column, relation, driver.ErrObjectNotFound)
	}
	if err != nil {
		return 0, fmt.Errorf("postgres: dependencies: resolve column: %w", err)
	}
	return attnum, nil
}

// queryNames runs a query whose only column is a name.
func queryNames(ctx context.Context, sqlDB *sql.DB, query string, args ...any) ([]string, error) {
	rows, err := sqlDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// dependentViews lists views and materialized views in schema whose
// pg_rewrite rule depends on table (pg_depend), the standard "what views
// read from this table" query. A non-zero attnum keeps only views that read
// that column.
func dependentViews(ctx context.Context, sqlDB *sql.DB, schema, table string, attnum int) ([]string, error) {
	return queryNames(ctx, sqlDB, `
		SELECT DISTINCT dependent_view.relname
		FROM pg_depend
		JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
		JOIN pg_class dependent_view ON pg_rewrite.ev_class = dependent_view.oid
		JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
		JOIN pg_class source_table ON pg_depend.refobjid = source_table.oid
		JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid
		WHERE source_ns.nspname = $1 AND source_table.relname = $2
		  AND dependent_view.relkind IN ('v', 'm')
		  AND dependent_view.oid != source_table.oid
		  AND dependent_ns.nspname = $1
		  AND ($3::int = 0 OR pg_depend.refobjsubid = $3::int)
	`, schema, table, attnum)
}

// viewBaseTables is the reverse of dependentViews: the tables view itself
// reads from.
func viewBaseTables(ctx context.Context, sqlDB *sql.DB, schema, view string) ([]string, error) {
	return queryNames(ctx, sqlDB, `
		SELECT DISTINCT source_table.relname
		FROM pg_depend
		JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
		JOIN pg_class dependent_view ON pg_rewrite.ev_class = dependent_view.oid
		JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
		JOIN pg_class source_table ON pg_depend.refobjid = source_table.oid
		JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid
		WHERE dependent_ns.nspname = $1 AND dependent_view.relname = $2
		  AND source_table.relkind IN ('r', 'p', 'v', 'm')
		  AND dependent_view.oid != source_table.oid
		  AND source_ns.nspname = $1
	`, schema, view)
}

// indexesOnTable lists table's indexes. A non-zero attnum keeps only those
// whose key columns, expression, or predicate use that column (the last two
// are recorded in pg_depend, not pg_index.indkey).
func indexesOnTable(ctx context.Context, sqlDB *sql.DB, schema, table string, attnum int) ([]string, error) {
	return queryNames(ctx, sqlDB, `
		SELECT i.relname
		FROM pg_index x
		JOIN pg_class i ON i.oid = x.indexrelid
		JOIN pg_class c ON c.oid = x.indrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relname = $2
		  AND ($3::int = 0
		       OR $3::int2 = ANY(x.indkey::int2[])
		       OR EXISTS (
		           SELECT 1 FROM pg_depend d
		           WHERE d.classid = 'pg_class'::regclass AND d.objid = x.indexrelid
		             AND d.refclassid = 'pg_class'::regclass AND d.refobjid = x.indrelid
		             AND d.refobjsubid = $3::int))
		ORDER BY i.relname
	`, schema, table, attnum)
}

// ownedSequences lists the sequences table owns (serial columns, OWNED BY,
// identity columns), which Postgres drops along with the table or column.
func ownedSequences(ctx context.Context, sqlDB *sql.DB, schema, table string, attnum int) ([]string, error) {
	return queryNames(ctx, sqlDB, `
		SELECT s.relname
		FROM pg_depend d
		JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
		JOIN pg_class c ON c.oid = d.refobjid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
		  AND d.deptype IN ('a', 'i')
		  AND n.nspname = $1 AND c.relname = $2
		  AND ($3::int = 0 OR d.refobjsubid = $3::int)
		ORDER BY s.relname
	`, schema, table, attnum)
}

type triggerRef struct{ name, function, table string }

// triggersOnTable lists a table's own triggers (never Postgres' own internal
// ones, e.g. for a foreign key) and the function each calls. A non-zero
// attnum keeps only triggers declared UPDATE OF that column; a trigger with
// no column list does not depend on any one column.
func triggersOnTable(ctx context.Context, sqlDB *sql.DB, schema, table string, attnum int) ([]triggerRef, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT t.tgname, p.proname
		FROM pg_trigger t
		JOIN pg_class c ON c.oid = t.tgrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_proc p ON p.oid = t.tgfoid
		WHERE n.nspname = $1 AND c.relname = $2 AND NOT t.tgisinternal
		  AND ($3::int = 0 OR $3::int2 = ANY(t.tgattr::int2[]))
	`, schema, table, attnum)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []triggerRef
	for rows.Next() {
		ref := triggerRef{table: table}
		if err := rows.Scan(&ref.name, &ref.function); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

// triggersCallingRoutine is the reverse of triggersOnTable for a routine
// root: every trigger in schema that executes routine, and its table.
func triggersCallingRoutine(ctx context.Context, sqlDB *sql.DB, schema, routine string) ([]triggerRef, error) {
	rows, err := sqlDB.QueryContext(ctx, `
		SELECT t.tgname, c.relname
		FROM pg_trigger t
		JOIN pg_class c ON c.oid = t.tgrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_proc p ON p.oid = t.tgfoid
		JOIN pg_namespace pn ON pn.oid = p.pronamespace
		WHERE pn.nspname = $1 AND p.proname = $2 AND n.nspname = $1 AND NOT t.tgisinternal
	`, schema, routine)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []triggerRef
	for rows.Next() {
		ref := triggerRef{function: routine}
		if err := rows.Scan(&ref.name, &ref.table); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

// possiblyDependentRoutines scans every routine's source in schema for a
// token matching object's name (and column's, when set), skipping object
// itself and any routine already connected through a real edge. Postgres
// never records a PL/pgSQL body's own references in pg_depend, so this is
// the only way to surface them, and it is always a guess, never a fact
// (confidence "name_match").
func possiblyDependentRoutines(ctx context.Context, sqlDB *sql.DB, schema, object, column string, existingNodes []models.MCPDependencyNode) ([]models.MCPPossibleDependency, error) {
	already := map[string]bool{strings.ToLower(object): true}
	for _, n := range existingNodes {
		if n.Kind == "routine" {
			already[strings.ToLower(n.Name)] = true
		}
	}

	rows, err := sqlDB.QueryContext(ctx, `
		SELECT DISTINCT p.proname, p.prosrc
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = $1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	target := strings.ToLower(object)
	targetColumn := strings.ToLower(column)
	var out []models.MCPPossibleDependency
	for rows.Next() {
		var name, src string
		if err := rows.Scan(&name, &src); err != nil {
			return nil, err
		}
		if already[strings.ToLower(name)] {
			continue
		}
		if !routineBodyMentions(src, target) {
			continue
		}
		if targetColumn != "" && !routineBodyMentions(src, targetColumn) {
			continue
		}
		already[strings.ToLower(name)] = true // overloads share a name; list it once
		out = append(out, models.MCPPossibleDependency{Kind: "routine", Name: name, Confidence: "name_match"})
	}
	return out, rows.Err()
}

// routineBodyMentions reports whether src contains target as an identifier
// token (case-insensitive, nested-dollar-quote and comment text excluded by
// the tokenizer itself). A body Tokenize cannot read (an unsupported token,
// decision D8) is treated as no match rather than guessing.
func routineBodyMentions(src, target string) bool {
	tokens, err := db.Tokenize("postgres", src)
	if err != nil {
		return false
	}
	for _, t := range tokens {
		if (t.Kind == db.TokenIdentifier || t.Kind == db.TokenQuotedIdentifier) && strings.EqualFold(unquoteForMatch(t.Text), target) {
			return true
		}
	}
	return false
}

// unquoteForMatch strips a quoted identifier's surrounding quotes so it
// compares the same way as an unquoted one. TokenIdentifier text is already
// lowercased and unquoted by the tokenizer; TokenQuotedIdentifier text is
// verbatim, including its quotes.
func unquoteForMatch(text string) string {
	if len(text) >= 2 && text[0] == '"' && text[len(text)-1] == '"' {
		return strings.ReplaceAll(text[1:len(text)-1], `""`, `"`)
	}
	return text
}
