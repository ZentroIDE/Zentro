# Architecture Decision Records (ADRs)

Each file in this directory records one architectural decision: what we chose, why, what alternatives we considered, and how we'd know to revisit.

## Index

- [ADR-0001](0001-ports-and-adapters-for-db-drivers.md) — Ports & Adapters for database drivers
- [ADR-0002](0002-event-constants-paired-be-fe.md) — Event names are constants, paired BE↔FE
- [ADR-0003](0003-zustand-for-frontend-state.md) — Zustand for frontend state
- [ADR-0004](0004-feature-first-with-boundary-guardrail.md) — Feature-first frontend modules with boundary guardrail
- [ADR-0005](0005-design-system-contract.md) — Design-system contract: native form controls banned in features
- [ADR-0006](0006-write-safety-guard.md) — Write-safety guard for mutating SQL
- [ADR-0007](0007-app-as-wails-facade-services-hold-logic.md) — `App` as Wails facade, services hold logic
- [ADR-0010](0010-pure-sql-completion-engine.md) — Pure SQL completion engine
- [ADR-0011](0011-theme-token-architecture.md) — Theme token architecture
- [ADR-0012](0012-metadata-only-ai-assistant.md) — Metadata-only assistant, BYOT first
- [ADR-0013](0013-model-provider-adapters.md) — Model provider adapters
- [ADR-0014](0014-schema-tools-and-mcp-server.md) — Schema tools for the chat and an MCP server for external agents
- [ADR-0015](0015-app-context-tools-and-plan-gating.md) — App context tools, and which plan gets which tool
- [ADR-0016](0016-project-memory-and-explained-writes.md) — Per-connection memory, and writes that explain themselves
- [ADR-0017](0017-ai-sees-schema-not-data.md) — The AI sees the schema, not the data
- [ADR-0018](0018-workspace-opens-without-project.md) — The workspace opens without a project
- [ADR-0019](0019-open-core-gpl-pro-build.md) — Open core: GPL-3.0, Pro build, and Pro attachment points

## Writing a new ADR

1. Copy [0000-template.md](0000-template.md) to the next number.
2. Fill it in. Keep it short — ~1 page is the target.
3. Include the ADR in the PR that implements the decision (not after the fact).
4. Add it to the index above.

ADRs are append-only. If a decision is reversed, write a new ADR that supersedes the old one; update the old one's status to `superseded by ADR-NNNN` and leave the body intact for history.

## When to write one

Write an ADR when the change:

- Introduces a new abstraction or boundary.
- Changes a dependency direction.
- Picks among technologies, libraries, or patterns where the alternatives are non-obvious.
- Will be questioned in 6 months by someone who wasn't there.

Don't write one for:

- Bug fixes.
- Refactors that preserve behavior and boundaries.
- Small UX choices.
