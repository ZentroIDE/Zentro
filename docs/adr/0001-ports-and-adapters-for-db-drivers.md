# ADR-0001 — Ports & Adapters for database drivers

- **Status**: accepted
- **Date**: 2026-04-26 (retroactive — established at project start)

## Context

Zentro must support multiple SQL engines (Postgres, MySQL, SQL Server, SQLite) with different SQL dialects, schema introspection mechanisms, pagination syntax, and error formats. Engines will be added over time. We need a way to isolate engine-specific code so that:

- Adding a 5th engine doesn't touch any non-driver code.
- Engine-specific quirks (e.g. SQL Server's `OFFSET … FETCH NEXT` vs Postgres `LIMIT/OFFSET`) don't leak into application services.
- Callers that only need part of a driver's capability (e.g. opening a connection) don't depend on the full surface.

## Decision

We use **Ports & Adapters** (Hexagonal Architecture). The ports live in [internal/driver/driver.go](../../internal/driver/driver.go) as three segregated interfaces:

- `Connector` — `Name`, `Open`, `FriendlyError`
- `SchemaFetcher` — `FetchDatabases`, `FetchSchema`, column/PK/FK queries, DDL operations
- `QueryDialect` — `InjectPageClause`, `DefaultSchema`

A composite `DatabaseDriver` interface embeds all three for cases that need everything, but callers should depend on the smallest interface they need.

Adapters live in `internal/driver/{postgres,mysql,mssql,sqlite}/`. A singleton registry in [internal/core/registry.go](../../internal/core/registry.go) maps driver name → instance. `main.go` is the only place that imports concrete driver packages — registration happens there.

## Alternatives considered

- **One fat `DatabaseDriver` interface** — simpler, but violates ISP. A schema-tree builder doesn't need pagination methods; coupling them makes mocking and testing harder.
- **Plugin system loaded at runtime** (`.so`/`.dll`) — overkill for a desktop app with a known set of supported engines. Adds packaging complexity for no real flexibility win.
- **Compile-time build tags per driver** — would shrink binary, but every user wants all 4 engines available. Build tags would only help if engines had heavy native dependencies (they don't).

## Consequences

- **Positive**: adding a new driver is a 2-file change (one new directory + one line in `main.go`). Application services depend only on the abstractions. Unit-testing application code with a fake driver is trivial.
- **Negative**: three interfaces are slightly more verbose than one. New developers may not immediately know which interface to depend on; mitigated by [EXTENDING.md](../EXTENDING.md) and this ADR.
- **Neutral**: the binary embeds all 4 drivers. Acceptable today (~10 MB total).

## How to revisit

- If we add a driver that doesn't fit the three ports (e.g. NoSQL, document DB), reconsider — the ports were designed for SQL semantics.
- If binary size becomes a concern and most users only use one engine, consider build-tag-based driver selection.
