// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

type assistantScript struct {
	Name    string
	Content string
}

// loadCatalog reads the schema catalog of the window's own open connection.
// A tool that resolves a different environment (T2.2 onward) uses
// loadCatalogFor instead, which this delegates to.
func (s *AIService) loadCatalog(ctx context.Context, schema string, includeBodies, refresh bool) (ai.Catalog, error) {
	schema = publicSchemaName(schema)
	if schema == "" {
		schema = publicSchemaName(s.currentSchema())
	}
	catalog, err := s.loadCatalogFor(ctx, s.db(), s.profile(), s.envKey(), schema, includeBodies, refresh)
	if err != nil {
		return ai.Catalog{}, err
	}
	// Scripts are read fresh every call, cache hit or not: they are cheap to
	// list and are tied to the window's own open project, not to whichever
	// environment loadCatalogFor cached its result under.
	catalog.Scripts = s.readScripts(includeBodies)
	return catalog, nil
}

// loadCatalogFor is loadCatalog's logic parameterized over an explicit
// connection, so a tool that resolved a non-open environment (resolveEnv,
// T1.6) can still search its schema by name instead of only reading raw
// catalog errors. It never reads scripts: those belong to the open project
// only, and attributing them to an arbitrary resolved environment would be
// wrong.
func (s *AIService) loadCatalogFor(ctx context.Context, db *sql.DB, profile *models.ConnectionProfile, envKey, schema string, includeBodies, refresh bool) (ai.Catalog, error) {
	if db == nil || profile == nil {
		return ai.Catalog{}, fmt.Errorf("connect to a database before using the assistant")
	}
	if schema == "" {
		return ai.Catalog{}, fmt.Errorf("choose a schema before using the assistant")
	}
	cacheKey := profile.ID + "\x00" + envKey + "\x00" + schema
	if includeBodies {
		cacheKey += "\x00bodies"
	}
	if !refresh {
		if cached, ok := s.cachedCatalog(cacheKey); ok {
			return cached, nil
		}
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	drv, ok := core.Get(profile.Driver)
	if !ok {
		return ai.Catalog{}, fmt.Errorf("database driver is not available")
	}
	extractor, ok := drv.(driverport.SchemaDiffExtractor)
	fetcher, fetchOK := drv.(driverport.SchemaFetcher)
	if !ok || !fetchOK {
		return ai.Catalog{}, fmt.Errorf("this database driver cannot describe schema structure")
	}

	catalog := ai.Catalog{
		Schema: schema,
		Notes: []string{
			"materialized views and triggers are not included",
			"row counts, statistics, and table data are not included",
		},
	}
	names, err := extractor.FetchSchemaTableNames(ctx, db, schema)
	if err != nil {
		s.warn("tables")
		return ai.Catalog{}, fmt.Errorf("could not read tables")
	}
	if len(names) > aiMaxTables {
		catalog.Notes = append(catalog.Notes, fmt.Sprintf("%d tables were not read", len(names)-aiMaxTables))
		names = names[:aiMaxTables]
	}
	for _, name := range names {
		table := ai.Table{Name: name}
		if columns, colErr := fetcher.FetchTableColumns(ctx, db, schema, name); colErr != nil {
			catalog.Notes = append(catalog.Notes, "columns for "+name+" could not be read")
		} else {
			for _, column := range columns {
				if column == nil {
					continue
				}
				table.Columns = append(table.Columns, ai.Column{
					Name:       column.Name,
					DataType:   column.DataType,
					Nullable:   column.IsNullable,
					PrimaryKey: column.IsPrimaryKey,
					Comment:    column.Description,
				})
			}
		}
		catalog.Tables = append(catalog.Tables, table)
	}

	catalog.Indexes = readObjects(s, "indexes", func() ([]ai.Object, error) {
		items, err := extractor.FetchSchemaIndexes(ctx, db, schema)
		if err != nil {
			return nil, err
		}
		out := make([]ai.Object, 0, len(items))
		for _, item := range items {
			out = append(out, objectFromDDL("index", item.Name, item.TableName, "", item.DDL, includeBodies))
		}
		return out, nil
	})
	catalog.Constraints = readObjects(s, "constraints", func() ([]ai.Object, error) {
		items, err := extractor.FetchSchemaConstraints(ctx, db, schema)
		if err != nil {
			return nil, err
		}
		out := make([]ai.Object, 0, len(items))
		for _, item := range items {
			out = append(out, objectFromDDL("constraint", item.Name, item.TableName, item.Type, item.DDL, includeBodies))
		}
		return out, nil
	})
	catalog.Views = readObjects(s, "views", func() ([]ai.Object, error) {
		items, err := extractor.FetchSchemaViews(ctx, db, schema)
		if err != nil {
			return nil, err
		}
		out := make([]ai.Object, 0, len(items))
		for _, item := range items {
			out = append(out, objectFromDDL("view", item.Name, "", "", item.DDL, includeBodies))
		}
		return out, nil
	})
	catalog.Routines = readObjects(s, "routines", func() ([]ai.Object, error) {
		items, err := extractor.FetchSchemaRoutines(ctx, db, schema)
		if err != nil {
			return nil, err
		}
		out := make([]ai.Object, 0, len(items))
		for _, item := range items {
			out = append(out, objectFromDDL("routine", item.Name, "", item.Signature, item.DDL, includeBodies))
		}
		return out, nil
	})
	s.storeCatalog(cacheKey, catalog)
	return catalog, nil
}

// aiMaxTables caps how many tables are read into the local catalog. The model
// no longer receives this catalog whole: the schema tools search it. Each table
// costs one column query on this computer, not tokens.
const aiMaxTables = 500

func readObjects(s *AIService, kind string, load func() ([]ai.Object, error)) []ai.Object {
	items, err := load()
	if err != nil {
		s.warn(kind)
		return []ai.Object{{Kind: kind, Name: "(unavailable)", Missing: true}}
	}
	return items
}

func objectFromDDL(kind, name, table, signature, ddl string, includeBodies bool) ai.Object {
	object := ai.Object{Kind: kind, Name: name, Table: table, Signature: signature}
	if !includeBodies {
		return object
	}
	body, missing := ai.PrepareBody(ddl)
	object.Body = body
	object.Missing = missing
	return object
}

func (s *AIService) readScripts(includeBodies bool) []ai.Object {
	project := s.project()
	profile := s.profile()
	if project == nil || profile == nil || s.scripts == nil {
		return nil
	}
	items, err := s.scripts(project.ID, profile.Name)
	if err != nil {
		s.warn("scripts")
		return []ai.Object{{Kind: "script", Name: "(unavailable)", Missing: true}}
	}
	if len(items) > 15 {
		items = items[:15]
	}
	out := make([]ai.Object, 0, len(items))
	for _, item := range items {
		object := ai.Object{Kind: "script", Name: item.Name}
		if includeBodies {
			body, missing := ai.PrepareBody(item.Content)
			object.Body = body
			object.Missing = missing
		}
		out = append(out, object)
	}
	return out
}

func (s *AIService) warn(step string) {
	if s.logger != nil {
		s.logger.Warn("assistant metadata unavailable", "step", step)
	}
}

func (s *AIService) cachedCatalog(key string) (ai.Catalog, bool) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if s.cacheKey != key {
		return ai.Catalog{}, false
	}
	return s.cache, true
}

func (s *AIService) storeCatalog(key string, catalog ai.Catalog) {
	s.cacheMu.Lock()
	s.cacheKey = key
	s.cache = catalog
	s.cacheMu.Unlock()
}

// dropCatalogCache forgets the cached catalog, so the next read goes to the
// database. Used after a change that may have altered the schema.
func (s *AIService) dropCatalogCache() {
	s.cacheMu.Lock()
	s.cacheKey = ""
	s.cache = ai.Catalog{}
	s.cacheMu.Unlock()
}

func (s *AIService) currentSchema() string {
	if s.schemaName == nil {
		return ""
	}
	return s.schemaName()
}

func publicSchemaName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, `/\`) || strings.Contains(strings.ToLower(name), ".db") {
		return ""
	}
	return name
}
