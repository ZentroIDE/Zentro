// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"strings"

	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

// aiIncludeBodiesKey carries the object_text switch into a live tool, which,
// unlike a run tool, does not receive it as an argument.
type aiIncludeBodiesKey struct{}

func withIncludeBodies(ctx context.Context, includeBodies bool) context.Context {
	return context.WithValue(ctx, aiIncludeBodiesKey{}, includeBodies)
}

func includeBodiesFrom(ctx context.Context) bool {
	on, _ := ctx.Value(aiIncludeBodiesKey{}).(bool)
	return on
}

type aiExternalAgentKey struct{}

// withExternalAgent marks a call that came from an external agent over MCP.
// Zentro cannot see where such an agent sends what it reads, so no row value
// is returned to it (ADR 0017).
func withExternalAgent(ctx context.Context) context.Context {
	return context.WithValue(ctx, aiExternalAgentKey{}, true)
}

type aiCompactMetaKey struct{}

// withCompactMeta asks runTool for the chat's shorter meta (aiCompactMeta).
func withCompactMeta(ctx context.Context) context.Context {
	return context.WithValue(ctx, aiCompactMetaKey{}, true)
}

func compactMetaFrom(ctx context.Context) bool {
	on, _ := ctx.Value(aiCompactMetaKey{}).(bool)
	return on
}

func fromExternalAgent(ctx context.Context) bool {
	on, _ := ctx.Value(aiExternalAgentKey{}).(bool)
	return on
}

// rowsAllowed reports whether a tool may put row values in its result for
// this call: Data mode is on for the project and the caller is the in-app chat,
// not an external agent. It does not depend on the plan: the assistant is free
// on every plan (ADR 0019).
func (s *AIService) rowsAllowed(ctx context.Context) bool {
	if fromExternalAgent(ctx) {
		return false
	}
	settings, _, err := s.readSettings()
	return err == nil && settings.DataMode
}

// aiCatalogScope is where a schema tool reads for one call: the open
// connection (when env is blank or names the open environment), or another
// environment of the project, opened for this call alone (resolveEnv).
type aiCatalogScope struct {
	Catalog ai.Catalog
	// DB and Profile are nil when the open connection is read through a
	// test's catalogFn; a tool that needs them checks.
	DB      *sql.DB
	Profile *models.ConnectionProfile
	Driver  string
	// Ambient is true for the open connection, so a tool can keep using the
	// app's own context source (relationships) there.
	Ambient bool
	meta    aiMeta
	close   func()
}

// Close releases a connection opened for another environment; it is a
// no-op for the open one.
func (c *aiCatalogScope) Close() {
	if c.close != nil {
		c.close()
	}
}

// result wraps a tool's data so the envelope's meta names the environment
// and schema actually read.
func (c *aiCatalogScope) result(data any, warnings ...string) aiEnvMetaOverride {
	return aiEnvMetaOverride{
		Data: data, Env: c.meta.Env, Driver: c.meta.Driver, Database: c.meta.Database, Schema: c.meta.Schema,
		Warnings: warnings,
	}
}

// openCatalogScope loads the catalog a schema tool reads, from the env and
// schema arguments. Blank env (or the open environment's own key) reads the
// open connection, through catalogFn when a test set one; schema picks
// another schema there. Any other env is resolved and opened for this call.
func (s *AIService) openCatalogScope(ctx context.Context, envArg, schemaArg string) (*aiCatalogScope, error) {
	envArg, schemaArg = strings.TrimSpace(envArg), publicSchemaName(schemaArg)
	includeBodies := includeBodiesFrom(ctx)

	if envArg == "" || strings.EqualFold(envArg, s.envKey()) {
		load := s.loadCatalog
		if s.catalogFn != nil {
			load = s.catalogFn
		}
		catalog, err := load(ctx, schemaArg, includeBodies, false)
		if err != nil {
			return nil, failTool(aiCodeInternal, "The schema could not be read: "+err.Error(), "")
		}
		scope := &aiCatalogScope{Catalog: catalog, Ambient: true, meta: s.buildMeta()}
		if s.db != nil {
			scope.DB = s.db()
		}
		if profile := s.currentProfile(); profile != nil {
			scope.Profile = profile
			scope.Driver = profile.Driver
		}
		if catalog.Schema != "" {
			scope.meta.Schema = catalog.Schema
		}
		return scope, nil
	}

	env, err := s.resolveEnv(ctx, envArg)
	if err != nil {
		return nil, err
	}
	schema := schemaArg
	if schema == "" {
		schema = env.Schema
	}
	if schema == "" {
		env.Close()
		return nil, failTool(aiCodeInvalidArgument, "schema is required", "Pass schema, or bind one to this environment in Zentro first.")
	}
	catalog, err := s.loadCatalogFor(ctx, env.DB, &env.Profile, env.Key, schema, includeBodies, false)
	if err != nil {
		env.Close()
		return nil, failTool(aiCodeInternal, "The schema could not be read: "+err.Error(), "")
	}
	meta := s.buildMeta()
	meta.Env, meta.Driver, meta.Database, meta.Schema = env.Key, env.Driver, env.Database, schema
	return &aiCatalogScope{
		Catalog: catalog, DB: env.DB, Profile: &env.Profile, Driver: env.Driver,
		meta: meta, close: env.Close,
	}, nil
}
