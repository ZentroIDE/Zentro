// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

var aiPreviewCascadeTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "preview_cascade",
		Description: "For a single-table DELETE, count child rows that would be deleted, set null, or set default by foreign keys, and name FKs that would block the delete.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"An environment key, for example dev or sta. Required."},` +
			`"sql":{"type":"string","description":"Exactly one single-table DELETE."},` +
			`"depth":{"type":"integer","minimum":1,"maximum":5,"description":"How many FK hops to walk. Defaults to 3."},` +
			`"max_count":{"type":"integer","minimum":1,"description":"Stop counting after this many rows. Defaults to 1000000."}` +
			`},"required":["env","sql"],"additionalProperties":false}`),
	},
	group:   aiGroupReadData,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Preview delete cascade" },
	live:    previewCascadeTool,
}

type aiCascadeRootDTO struct {
	Table        string `json:"table"`
	AffectedRows int64  `json:"affectedRows"`
}

type aiCascadeEffectDTO struct {
	Table  string `json:"table"`
	FK     string `json:"fk"`
	Action string `json:"action"`
	Rows   int64  `json:"rows"`
	Depth  int    `json:"depth"`
	Capped bool   `json:"capped"`
}

type aiCascadeBlockerDTO struct {
	Table  string `json:"table"`
	FK     string `json:"fk"`
	Rows   int64  `json:"rows"`
	Action string `json:"action"`
}

type aiCascadeSummaryDTO struct {
	DeletedRows int `json:"deletedRows"`
	Tables      int `json:"tables"`
}

type aiCascadeDTO struct {
	Root     aiCascadeRootDTO      `json:"root"`
	Effects  []aiCascadeEffectDTO  `json:"effects"`
	Blockers []aiCascadeBlockerDTO `json:"blockers"`
	Summary  aiCascadeSummaryDTO   `json:"summary"`
}

type fkHop struct {
	Name       string
	Child      string
	Action     string
	ChildCols  []string
	ParentCols []string
	Deferrable *bool
}

func previewCascadeTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env      string `json:"env"`
		SQL      string `json:"sql"`
		Depth    int    `json:"depth"`
		MaxCount int    `json:"max_count"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass env and the DELETE to preview", "")
	}
	target, shapeErr := db.ParseCountTarget("", in.SQL, true)
	if shapeErr != nil {
		return nil, shapeToToolError(shapeErr)
	}
	env, runner, dialect, schema, err := s.openReadRunner(ctx, in.Env, "")
	if err != nil {
		return nil, err
	}
	defer env.Close()
	if dialect == nil {
		return nil, failTool(aiCodeUnsupportedDriver, "this driver cannot quote identifiers", "")
	}
	catalog, err := loadCatalogForEnv(ctx, s, env, schema)
	if err != nil {
		return nil, err
	}
	table, err := matchCountTable(catalog, target)
	if err != nil {
		return nil, err
	}
	depth := in.Depth
	if depth <= 0 {
		depth = 3
	}
	if depth > 5 {
		depth = 5
	}
	maxCount := in.MaxCount
	if maxCount <= 0 {
		maxCount = 1000000
	}
	policy := s.executionPolicy(env.Key)
	timeout := clampTimeout(15, policy)

	rootSQL := buildCountSQL(dialect, schema, table, target, maxCount)
	rootN, err := runGuardedCount(ctx, runner, env, schema, rootSQL, timeout, time.Second)
	if err != nil {
		return nil, err
	}
	if rootN > int64(maxCount) {
		rootN = int64(maxCount)
	}

	drv, _ := core.Get(env.Driver)
	fetcher, ok := drv.(driverport.SchemaFetcher)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, "this driver cannot read foreign keys", "")
	}

	out := aiCascadeDTO{
		Root:     aiCascadeRootDTO{Table: table.Name, AffectedRows: rootN},
		Effects:  []aiCascadeEffectDTO{},
		Blockers: []aiCascadeBlockerDTO{},
	}
	seen := map[string]bool{strings.ToLower(table.Name): true}
	tables := map[string]bool{strings.ToLower(table.Name): true}
	deleted := rootN
	deferrable := false

	var walk func(parent ai.Table, incomingKeys string, orig *db.CountTarget, level int) error
	walk = func(parent ai.Table, incomingKeys string, orig *db.CountTarget, level int) error {
		if level > depth {
			return nil
		}
		rels, rErr := fetcher.FetchTableRelationships(ctx, env.DB, schema, parent.Name)
		if rErr != nil {
			return failTool(aiCodeInternal, "foreign keys could not be read", "")
		}
		for _, hop := range groupIncomingFKs(rels, parent.Name) {
			if hop.Deferrable != nil && *hop.Deferrable {
				deferrable = true
			}
			child, ok := findTable(catalog, hop.Child)
			if !ok {
				continue
			}
			keys := incomingKeys
			if orig != nil {
				keys = "SELECT " + quoteList(dialect, hop.ParentCols) + " FROM " + rewriteFromClause(dialect, schema, parent, orig.Alias)
				if orig.WhereSQL != "" {
					keys += " " + orig.WhereSQL
				}
			}
			countSQL := childCountSQL(dialect, schema, child, hop, keys, maxCount)
			n, cErr := runGuardedCount(ctx, runner, env, schema, countSQL, timeout, time.Second)
			if cErr != nil {
				return cErr
			}
			capped := n > int64(maxCount)
			if capped {
				n = int64(maxCount)
			}
			action := hop.Action
			tables[strings.ToLower(child.Name)] = true
			switch action {
			case "restrict", "no_action":
				if n > 0 {
					out.Blockers = append(out.Blockers, aiCascadeBlockerDTO{Table: child.Name, FK: hop.Name, Rows: n, Action: action})
				}
			case "delete":
				out.Effects = append(out.Effects, aiCascadeEffectDTO{Table: child.Name, FK: hop.Name, Action: action, Rows: n, Depth: level, Capped: capped})
				deleted += n
				childKey := "SELECT " + quoteList(dialect, hop.ChildCols) + " FROM " + db.QuoteQualified(dialect.QuoteIdentifier, schema, child.Name) +
					" WHERE " + rowExpr(dialect, hop.ChildCols) + " IN (" + keys + ")"
				id := strings.ToLower(child.Name) + ":" + hop.Name
				if !seen[id] {
					seen[id] = true
					if wErr := walk(child, childKey, nil, level+1); wErr != nil {
						return wErr
					}
				}
			default:
				out.Effects = append(out.Effects, aiCascadeEffectDTO{Table: child.Name, FK: hop.Name, Action: action, Rows: n, Depth: level, Capped: capped})
			}
		}
		return nil
	}
	if err := walk(table, "", target, 1); err != nil {
		return nil, err
	}
	out.Summary = aiCascadeSummaryDTO{DeletedRows: int(deleted), Tables: len(tables)}

	warnings := []string{
		"Foreign keys may be deferrable; this count is as of now, not at commit.",
		"Triggers and rules on child tables are not simulated.",
		"A child foreign key without an index can make this count slow.",
	}
	if deferrable {
		warnings = append(warnings, "At least one foreign key is deferrable, so a blocker might only appear at commit.")
	}

	return aiEnvMetaOverride{
		Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema, Warnings: warnings,
	}, nil
}

func groupIncomingFKs(rels []models.TableRelationship, parent string) []fkHop {
	byName := map[string]*fkHop{}
	var order []string
	for _, rel := range rels {
		if !strings.EqualFold(rel.TargetTable, parent) {
			continue
		}
		hop, ok := byName[rel.ConstraintName]
		if !ok {
			hop = &fkHop{
				Name:       rel.ConstraintName,
				Child:      rel.SourceTable,
				Action:     cascadeAction(rel.OnDelete),
				Deferrable: rel.Deferrable,
			}
			byName[rel.ConstraintName] = hop
			order = append(order, rel.ConstraintName)
		}
		hop.ChildCols = append(hop.ChildCols, rel.SourceColumn)
		hop.ParentCols = append(hop.ParentCols, rel.TargetColumn)
	}
	out := make([]fkHop, 0, len(order))
	for _, name := range order {
		out = append(out, *byName[name])
	}
	return out
}

func cascadeAction(onDelete string) string {
	switch strings.ToUpper(strings.TrimSpace(onDelete)) {
	case "CASCADE":
		return "delete"
	case "SET NULL":
		return "set_null"
	case "SET DEFAULT":
		return "set_default"
	case "RESTRICT":
		return "restrict"
	default:
		return "no_action"
	}
}

func quoteList(dialect driverport.QueryDialect, names []string) string {
	quoted := make([]string, len(names))
	for i, name := range names {
		quoted[i] = dialect.QuoteIdentifier(name)
	}
	return strings.Join(quoted, ", ")
}

func rowExpr(dialect driverport.QueryDialect, names []string) string {
	list := quoteList(dialect, names)
	if len(names) <= 1 {
		return list
	}
	return "(" + list + ")"
}

func childCountSQL(dialect driverport.QueryDialect, schema string, child ai.Table, hop fkHop, parentKeys string, maxCount int) string {
	from := db.QuoteQualified(dialect.QuoteIdentifier, schema, child.Name)
	inner := "SELECT 1 FROM " + from + " WHERE " + rowExpr(dialect, hop.ChildCols) + " IN (" + parentKeys + ")"
	if maxCount < 1 {
		maxCount = 1
	}
	return "SELECT count(*) FROM (" + inner + " LIMIT " + strconv.Itoa(maxCount+1) + ") zentro_cascade"
}
