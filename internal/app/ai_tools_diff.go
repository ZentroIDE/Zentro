// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/db"
	"zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

// diff_schema compares the catalogs of two environments of the open project
// (spec section 3). It reads structure only, through the same
// SchemaDiffExtractor port the schema-compare screen uses, never data.
var aiDiffSchemaTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "diff_schema",
		Description: "Compare the schema of two environments of this project: which tables, views, routines, indexes, and constraints exist on only one side or differ. detail full adds what changed (columns added or removed, type, nullability, default, definition). View and routine text is compared by hash and only returned when the user allowed object text.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"from_env":{"type":"string","description":"The source environment key, for example dev."},` +
			`"to_env":{"type":"string","description":"The target environment key, for example sta."},` +
			`"kinds":{"type":"array","items":{"type":"string","enum":["table","view","routine","index","constraint"]},"description":"Which object kinds to compare. Defaults to all."},` +
			`"detail":{"type":"string","enum":["summary","full"],"description":"summary (default) lists objects; full adds the changes of each."},` +
			`"ignore_column_order":{"type":"boolean","description":"Defaults to true. False also reports a table whose columns are in a different order."}` +
			`},"required":["from_env","to_env"],"additionalProperties":false}`),
	},
	group:   aiGroupMetadata,
	envArgs: []string{"from_env", "to_env"},
	label: func(args json.RawMessage) string {
		var in struct {
			From string `json:"from_env"`
			To   string `json:"to_env"`
		}
		_ = json.Unmarshal(args, &in)
		return "Compare the schema of " + in.From + " and " + in.To
	},
	live: diffSchemaTool,
}

// aiDiffMaxObjects caps objects[]; past it the result is truncated and the
// agent narrows with kinds.
const aiDiffMaxObjects = 500

var aiDiffAllKinds = []string{"table", "view", "routine", "index", "constraint"}

type aiSchemaChangeDTO struct {
	What     string `json:"what"`
	Column   string `json:"column,omitempty"`
	From     string `json:"from,omitempty"`
	To       string `json:"to,omitempty"`
	FromHash string `json:"fromHash,omitempty"`
	ToHash   string `json:"toHash,omitempty"`
}

type aiSchemaDiffObjectDTO struct {
	Kind    string              `json:"kind"`
	Name    string              `json:"name"`
	Table   string              `json:"table,omitempty"`
	Status  string              `json:"status"`
	Changes []aiSchemaChangeDTO `json:"changes,omitempty"`
}

type aiSchemaDiffSummaryDTO struct {
	OnlyInFrom int `json:"onlyInFrom"`
	OnlyInTo   int `json:"onlyInTo"`
	Changed    int `json:"changed"`
}

type aiSchemaDiffDTO struct {
	From       string                  `json:"from"`
	To         string                  `json:"to"`
	Summary    aiSchemaDiffSummaryDTO  `json:"summary"`
	Objects    []aiSchemaDiffObjectDTO `json:"objects"`
	ComparedAt string                  `json:"comparedAt"`
}

// schemaDiffOptions are the comparison switches, kept apart from the
// environment plumbing so diffSchemaSnapshots is testable on its own.
type schemaDiffOptions struct {
	Kinds             map[string]bool
	Full              bool
	IgnoreColumnOrder bool
	IncludeBodies     bool
}

func diffSchemaTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		From              string   `json:"from_env"`
		To                string   `json:"to_env"`
		Kinds             []string `json:"kinds"`
		Detail            string   `json:"detail"`
		IgnoreColumnOrder *bool    `json:"ignore_column_order"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, failTool(aiCodeInvalidArgument, "the arguments do not match the tool", "")
	}
	from, to := strings.TrimSpace(in.From), strings.TrimSpace(in.To)
	if from == "" || to == "" {
		return nil, failTool(aiCodeEnvRequired, "pass both from_env and to_env", "Use list_environments to see this project's environments.")
	}
	if strings.EqualFold(from, to) {
		return nil, failTool(aiCodeInvalidArgument, "from_env and to_env are the same environment", "")
	}
	opts := schemaDiffOptions{Kinds: map[string]bool{}, IgnoreColumnOrder: true}
	switch in.Detail {
	case "", "summary":
	case "full":
		opts.Full = true
	default:
		return nil, failTool(aiCodeInvalidArgument, "detail must be summary or full", "")
	}
	if in.IgnoreColumnOrder != nil {
		opts.IgnoreColumnOrder = *in.IgnoreColumnOrder
	}
	kinds := in.Kinds
	if len(kinds) == 0 {
		kinds = aiDiffAllKinds
	}
	for _, kind := range kinds {
		if !containsString(aiDiffAllKinds, kind) {
			return nil, failTool(aiCodeInvalidArgument, fmt.Sprintf("unknown kind %q; use table, view, routine, index, or constraint", kind), "")
		}
		opts.Kinds[kind] = true
	}
	opts.IncludeBodies = includeBodiesFrom(ctx)

	fromEnv, err := s.resolveEnv(ctx, from)
	if err != nil {
		return nil, sideError("from_env", from, err)
	}
	defer fromEnv.Close()
	toEnv, err := s.resolveEnv(ctx, to)
	if err != nil {
		return nil, sideError("to_env", to, err)
	}
	defer toEnv.Close()

	if !strings.EqualFold(fromEnv.Driver, toEnv.Driver) {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("%s uses %s and %s uses %s; diff_schema compares two databases of the same kind", fromEnv.Key, fromEnv.Driver, toEnv.Key, toEnv.Driver), "")
	}
	drv, ok := core.Get(fromEnv.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", fromEnv.Driver), "")
	}
	if fromEnv.Schema == "" || toEnv.Schema == "" {
		return nil, failTool(aiCodeInvalidArgument, "both environments need a schema", "Bind a schema to each environment in Zentro first.")
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	fromSnap, err := readSchemaForDiff(ctx, drv, fromEnv, opts.Kinds)
	if err != nil {
		return nil, failTool(aiCodeInternal, "the schema of "+fromEnv.Key+" could not be read", "")
	}
	toSnap, err := readSchemaForDiff(ctx, drv, toEnv, opts.Kinds)
	if err != nil {
		return nil, failTool(aiCodeInternal, "the schema of "+toEnv.Key+" could not be read", "")
	}

	out, truncated := diffSchemaSnapshots(fromSnap, toSnap, opts)
	out.From, out.To = fromEnv.Key, toEnv.Key
	out.ComparedAt = time.Now().UTC().Format(time.RFC3339)

	warnings := []string{}
	if truncated {
		warnings = append(warnings, fmt.Sprintf("Only the first %d objects are listed; pass kinds to narrow the comparison.", aiDiffMaxObjects))
	}
	if !opts.IncludeBodies && (opts.Kinds["view"] || opts.Kinds["routine"]) {
		warnings = append(warnings, "View and routine text is compared by hash only; object text is off for this project.")
	}
	if fromEnv.Driver != constant.DriverPostgres {
		warnings = append(warnings, fmt.Sprintf("diff_schema is fully supported on Postgres; on %s some object kinds may be missing from both sides.", fromEnv.Driver))
	}
	schema := fromEnv.Schema
	if toEnv.Schema != fromEnv.Schema {
		schema = fromEnv.Schema + " -> " + toEnv.Schema
	}
	return aiEnvMetaOverride{
		Data: out, Env: fromEnv.Key + " -> " + toEnv.Key, Driver: fromEnv.Driver,
		Database: fromEnv.Database + " -> " + toEnv.Database, Schema: schema,
		Warnings: warnings, Truncated: truncated,
	}, nil
}

// sideError says which side of the comparison failed, keeping the original
// code (ENV_NOT_FOUND, NOT_CONNECTED) and never the raw driver error.
func sideError(arg, key string, err error) error {
	var toolErr *aiToolError
	if errors.As(err, &toolErr) {
		return failTool(toolErr.Code, fmt.Sprintf("%s (%s): %s", arg, key, toolErr.Message), toolErr.Hint)
	}
	return failTool(aiCodeNotConnected, fmt.Sprintf("%s (%s) could not be opened", arg, key), "")
}

// readSchemaForDiff reads only the kinds asked for, through the
// SchemaDiffExtractor port and the same table-and-column reader the
// schema-compare screen uses (fetchSchemaTableSnapshots).
func readSchemaForDiff(ctx context.Context, drv driver.DatabaseDriver, env *resolvedEnv, kinds map[string]bool) (models.SchemaSnapshot, error) {
	snap := models.SchemaSnapshot{Driver: env.Driver, DatabaseName: env.Database, SchemaName: env.Schema}
	var err error
	if kinds["table"] {
		names, nameErr := drv.FetchSchemaTableNames(ctx, env.DB, env.Schema)
		if nameErr != nil {
			return snap, nameErr
		}
		if snap.Tables, err = fetchSchemaTableSnapshots(ctx, drv, env.DB, env.Schema, names); err != nil {
			return snap, err
		}
	}
	if kinds["index"] {
		if snap.Indexes, err = drv.FetchSchemaIndexes(ctx, env.DB, env.Schema); err != nil {
			return snap, err
		}
	}
	if kinds["constraint"] {
		if snap.Constraints, err = drv.FetchSchemaConstraints(ctx, env.DB, env.Schema); err != nil {
			return snap, err
		}
	}
	if kinds["view"] {
		if snap.Views, err = drv.FetchSchemaViews(ctx, env.DB, env.Schema); err != nil {
			return snap, err
		}
	}
	if kinds["routine"] {
		if snap.Routines, err = drv.FetchSchemaRoutines(ctx, env.DB, env.Schema); err != nil {
			return snap, err
		}
	}
	return snap, nil
}

// diffSchemaSnapshots compares two snapshots by name, kind by kind, in a
// fixed order (tables, views, routines, indexes, constraints), each sorted
// by name. The summary counts every difference; objects[] stops at
// aiDiffMaxObjects and the second result reports that it did.
func diffSchemaSnapshots(from, to models.SchemaSnapshot, opts schemaDiffOptions) (aiSchemaDiffDTO, bool) {
	var objects []aiSchemaDiffObjectDTO
	if opts.Kinds["table"] {
		objects = append(objects, diffSchemaTables(from.Tables, to.Tables, opts)...)
	}
	if opts.Kinds["view"] {
		objects = append(objects, diffSchemaBodies("view", viewBodies(from), viewBodies(to), from.SchemaName, to.SchemaName, opts)...)
	}
	if opts.Kinds["routine"] {
		objects = append(objects, diffSchemaBodies("routine", routineBodies(from), routineBodies(to), from.SchemaName, to.SchemaName, opts)...)
	}
	if opts.Kinds["index"] {
		objects = append(objects, diffSchemaDefinitions("index", "index_changed", indexDefinitions(from), indexDefinitions(to), from.SchemaName, to.SchemaName, opts)...)
	}
	if opts.Kinds["constraint"] {
		objects = append(objects, diffSchemaDefinitions("constraint", "constraint_changed", constraintDefinitions(from), constraintDefinitions(to), from.SchemaName, to.SchemaName, opts)...)
	}

	out := aiSchemaDiffDTO{Objects: []aiSchemaDiffObjectDTO{}}
	for _, o := range objects {
		switch o.Status {
		case "only_in_from":
			out.Summary.OnlyInFrom++
		case "only_in_to":
			out.Summary.OnlyInTo++
		case "changed":
			out.Summary.Changed++
		}
	}
	truncated := len(objects) > aiDiffMaxObjects
	if truncated {
		objects = objects[:aiDiffMaxObjects]
	}
	for _, o := range objects {
		if !opts.Full {
			o.Changes = nil
		}
		out.Objects = append(out.Objects, o)
	}
	return out, truncated
}

func diffSchemaTables(from, to []models.SchemaTableSnapshot, opts schemaDiffOptions) []aiSchemaDiffObjectDTO {
	fromByName := map[string]models.SchemaTableSnapshot{}
	for _, t := range from {
		fromByName[t.Name] = t
	}
	toByName := map[string]models.SchemaTableSnapshot{}
	for _, t := range to {
		toByName[t.Name] = t
	}
	var out []aiSchemaDiffObjectDTO
	for _, name := range unionNames(keysOf(fromByName), keysOf(toByName)) {
		f, inFrom := fromByName[name]
		t, inTo := toByName[name]
		switch {
		case !inTo:
			out = append(out, aiSchemaDiffObjectDTO{Kind: "table", Name: name, Status: "only_in_from"})
		case !inFrom:
			out = append(out, aiSchemaDiffObjectDTO{Kind: "table", Name: name, Status: "only_in_to"})
		default:
			if changes := diffSchemaColumns(f.Columns, t.Columns, opts.IgnoreColumnOrder); len(changes) > 0 {
				out = append(out, aiSchemaDiffObjectDTO{Kind: "table", Name: name, Status: "changed", Changes: changes})
			}
		}
	}
	return out
}

// diffColumns lists column-level changes. Defaults are shown with literals
// replaced, like describe_table, but compared as written.
func diffSchemaColumns(from, to []models.ColumnDef, ignoreOrder bool) []aiSchemaChangeDTO {
	fromByName := map[string]models.ColumnDef{}
	var fromOrder, toOrder []string
	for _, c := range from {
		fromByName[c.Name] = c
		fromOrder = append(fromOrder, c.Name)
	}
	toByName := map[string]models.ColumnDef{}
	for _, c := range to {
		toByName[c.Name] = c
		toOrder = append(toOrder, c.Name)
	}
	var changes []aiSchemaChangeDTO
	for _, c := range to {
		if _, ok := fromByName[c.Name]; !ok {
			changes = append(changes, aiSchemaChangeDTO{What: "column_added", Column: c.Name, To: columnType(c)})
		}
	}
	for _, c := range from {
		t, ok := toByName[c.Name]
		if !ok {
			changes = append(changes, aiSchemaChangeDTO{What: "column_removed", Column: c.Name, From: columnType(c)})
			continue
		}
		if !strings.EqualFold(columnType(c), columnType(t)) {
			changes = append(changes, aiSchemaChangeDTO{What: "type_changed", Column: c.Name, From: columnType(c), To: columnType(t)})
		}
		if c.IsNullable != t.IsNullable {
			changes = append(changes, aiSchemaChangeDTO{What: "nullability_changed", Column: c.Name, From: nullability(c.IsNullable), To: nullability(t.IsNullable)})
		}
		if strings.TrimSpace(c.DefaultValue) != strings.TrimSpace(t.DefaultValue) {
			changes = append(changes, aiSchemaChangeDTO{What: "default_changed", Column: c.Name, From: normalizedDefault(c.DefaultValue), To: normalizedDefault(t.DefaultValue)})
		}
		if c.IsPrimaryKey != t.IsPrimaryKey {
			changes = append(changes, aiSchemaChangeDTO{What: "constraint_changed", Column: c.Name, From: primaryKeyLabel(c.IsPrimaryKey), To: primaryKeyLabel(t.IsPrimaryKey)})
		}
	}
	if !ignoreOrder && len(changes) == 0 && !sameStringSlices(fromOrder, toOrder) {
		changes = append(changes, aiSchemaChangeDTO{What: "column_order_changed", From: strings.Join(fromOrder, ", "), To: strings.Join(toOrder, ", ")})
	}
	return changes
}

func columnType(c models.ColumnDef) string {
	return firstNonEmpty(c.FullDataType, c.DataType)
}

func nullability(nullable bool) string {
	if nullable {
		return "null"
	}
	return "not null"
}

func primaryKeyLabel(pk bool) string {
	if pk {
		return "primary key"
	}
	return "not primary key"
}

func normalizedDefault(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return db.NormalizeLiterals(value)
}

// schemaBody is one view or routine to compare by the hash of its text.
type schemaBody struct {
	key, name, ddl string
}

func viewBodies(snap models.SchemaSnapshot) []schemaBody {
	out := make([]schemaBody, 0, len(snap.Views))
	for _, v := range snap.Views {
		out = append(out, schemaBody{key: v.Name, name: v.Name, ddl: v.DDL})
	}
	return out
}

// routineBodies keys a routine by name and signature, since Postgres allows
// overloads that share a name.
func routineBodies(snap models.SchemaSnapshot) []schemaBody {
	out := make([]schemaBody, 0, len(snap.Routines))
	for _, r := range snap.Routines {
		name := r.Name
		if r.Signature != "" && !strings.Contains(r.Name, "(") {
			name = r.Name + "(" + strings.Trim(r.Signature, "()") + ")"
		}
		out = append(out, schemaBody{key: name, name: name, ddl: r.DDL})
	}
	return out
}

func diffSchemaBodies(kind string, from, to []schemaBody, fromSchema, toSchema string, opts schemaDiffOptions) []aiSchemaDiffObjectDTO {
	fromByKey := map[string]schemaBody{}
	for _, b := range from {
		fromByKey[b.key] = b
	}
	toByKey := map[string]schemaBody{}
	for _, b := range to {
		toByKey[b.key] = b
	}
	var out []aiSchemaDiffObjectDTO
	for _, key := range unionNames(keysOf(fromByKey), keysOf(toByKey)) {
		f, inFrom := fromByKey[key]
		t, inTo := toByKey[key]
		switch {
		case !inTo:
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: f.name, Status: "only_in_from"})
		case !inFrom:
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: t.name, Status: "only_in_to"})
		default:
			fromHash := bodyHash(comparableDDL(f.ddl, fromSchema))
			toHash := bodyHash(comparableDDL(t.ddl, toSchema))
			if fromHash == toHash {
				continue
			}
			change := aiSchemaChangeDTO{What: "body_changed", FromHash: fromHash, ToHash: toHash}
			if opts.IncludeBodies {
				change.From, _ = ai.PrepareBody(f.ddl)
				change.To, _ = ai.PrepareBody(t.ddl)
			}
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: f.name, Status: "changed", Changes: []aiSchemaChangeDTO{change}})
		}
	}
	return out
}

// schemaDefinition is one index or constraint, compared on its DDL. These
// are structure, not object text, so they are shown with literals replaced
// whatever the object_text switch says.
type schemaDefinition struct {
	key, name, table, ddl string
}

func indexDefinitions(snap models.SchemaSnapshot) []schemaDefinition {
	out := make([]schemaDefinition, 0, len(snap.Indexes))
	for _, ix := range snap.Indexes {
		out = append(out, schemaDefinition{key: ix.Name, name: ix.Name, table: ix.TableName, ddl: ix.DDL})
	}
	return out
}

func constraintDefinitions(snap models.SchemaSnapshot) []schemaDefinition {
	out := make([]schemaDefinition, 0, len(snap.Constraints))
	for _, c := range snap.Constraints {
		out = append(out, schemaDefinition{key: c.TableName + "\x00" + c.Name, name: c.Name, table: c.TableName, ddl: c.DDL})
	}
	return out
}

func diffSchemaDefinitions(kind, what string, from, to []schemaDefinition, fromSchema, toSchema string, _ schemaDiffOptions) []aiSchemaDiffObjectDTO {
	fromByKey := map[string]schemaDefinition{}
	for _, d := range from {
		fromByKey[d.key] = d
	}
	toByKey := map[string]schemaDefinition{}
	for _, d := range to {
		toByKey[d.key] = d
	}
	var out []aiSchemaDiffObjectDTO
	for _, key := range unionNames(keysOf(fromByKey), keysOf(toByKey)) {
		f, inFrom := fromByKey[key]
		t, inTo := toByKey[key]
		switch {
		case !inTo:
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: f.name, Table: f.table, Status: "only_in_from"})
		case !inFrom:
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: t.name, Table: t.table, Status: "only_in_to"})
		default:
			fromDDL, toDDL := comparableDDL(f.ddl, fromSchema), comparableDDL(t.ddl, toSchema)
			if fromDDL == toDDL {
				continue
			}
			out = append(out, aiSchemaDiffObjectDTO{Kind: kind, Name: f.name, Table: f.table, Status: "changed", Changes: []aiSchemaChangeDTO{
				{What: what, From: db.NormalizeLiterals(fromDDL), To: db.NormalizeLiterals(toDDL)},
			}})
		}
	}
	return out
}

// comparableDDL drops the schema qualifier and collapses whitespace, so the
// same object in dev's "app" schema and sta's "app_sta" schema compares
// equal. Text inside string literals that happens to read "schema." is
// rewritten too; that can only hide a difference inside a literal, and the
// hash of a view body is a hint, not a proof.
func comparableDDL(ddl, schema string) string {
	text := normalizeInlineSQL(ddl)
	if schema == "" {
		return text
	}
	qualifier := regexp.MustCompile(`(?i)(^|[^\w"])(` + regexp.QuoteMeta(schema) + `|"` + regexp.QuoteMeta(schema) + `")\.`)
	return qualifier.ReplaceAllString(text, "$1")
}

func bodyHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return "sha256:" + hex.EncodeToString(sum[:])[:16]
}

func keysOf[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// unionNames is every name on either side, sorted, each once.
func unionNames(a, b []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, list := range [][]string{a, b} {
		for _, name := range list {
			if !seen[name] {
				seen[name] = true
				out = append(out, name)
			}
		}
	}
	sort.Strings(out)
	return out
}

func containsString(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
