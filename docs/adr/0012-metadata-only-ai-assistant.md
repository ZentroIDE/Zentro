# ADR 0012 — Metadata-only assistant, BYOT first

- **Status**: accepted; the whole-schema prompt and the closed external MCP server are superseded by [ADR 0014](0014-schema-tools-and-mcp-server.md)
- **Date**: 2026-10-05
- **Decision drivers**: issue #105, and the requirement that customer rows never leave the machine through a path Zentro opens

## Context

Zentro is a local SQL client. An in-app assistant is useful for writing and explaining SQL, and it is also a new way for schema text and anything the user types to leave the machine. ACP agents can run their own shell. A skill file does not stop that.

## Decision

The free plan includes the assistant. It stays off until a project turns it on. The only path that ships in this change is BYOT: Zentro builds the request from metadata, shows that body, then posts it to a host the user named.

- The model receives schema structure. View, routine, and script bodies stay out unless that send opts in, and those bodies pass through a literal scrubber first.
- Rows, result grids, database errors, `EXPLAIN` output, credentials, and connection profiles are not part of the payload.
- The API key stays in the OS keyring. The request refuses redirects and refuses a host that is not loopback unless the project allowed cloud, the environment is not production, and the license is not the enterprise airgap tier.
- Email, phone, card, JWT, and connection-string shapes in the final body hold the send until the user accepts that exact text.
- ACP and the external MCP server are not started. ACP stays unavailable until the child process can be confined so it cannot read database files or open database ports. A warning label is not a substitute.

Generated SQL opens in a new editor tab. The user runs it. The risk badge uses static `AnalyzeSQLRisk`.

## Alternatives considered

- **ACP first, with a provider skill that says "do not SELECT".** The agent can ignore the skill, and its own shell does not pass through Zentro.
- **Nightly-channel gate.** The nightly channel is not the rollout switch for this work.
- **Putting the API key in preferences JSON.** That file is round-tripped by the settings screen and would leak the key.

## Consequences

- **Positive** — the bytes that leave the machine are the bytes in the preview. Local models stay on loopback.
- **Negative** — users cannot point an external Claude Code or Codex at an in-app MCP server yet. Subscription OAuth tokens are not accepted.
- **Neutral** — a person who copies a result grid into some other app is outside this boundary.

## How to revisit

Ship ACP only after a test shows the spawned agent cannot read a SQLite file and cannot open a database port. Revisit the airgap rule if enterprise seats need cloud BYOT under an admin lock (issue #103).
