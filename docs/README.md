# Docs

Engineering documentation for Zentro. Start here if you're a contributor.

## Read first

- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** — mental model, where things live, design patterns.

## When you're working

- **[EXTENDING.md](EXTENDING.md)** — recipes: add driver, Wails method, event, feature module, UI primitive.
- **[ENGINEERING.md](ENGINEERING.md)** — engineering charter (mission, SOLID rules, anti-patterns, working style).
- **[rules/](rules/)** — focused rule sheets: architecture, coding style, commit convention.

## Reference

- **[adr/](adr/)** — Architecture Decision Records.
- **[TECH-DEBT.md](TECH-DEBT.md)** — known fat files and refactor candidates.

## Process

- **[../CONTRIBUTING.md](../CONTRIBUTING.md)** — PR process.

## For AI agents

- **[../CLAUDE.md](../CLAUDE.md)** — dense summary; Claude's canonical Matt Pocock skill setup points here.
- **[../AGENTS.md](../AGENTS.md)** — repo instructions loaded by Codex and other AGENTS-aware tools.
- **[../.agent/](../.agent/)** — repo-local rules and workflows used across agents.
- **[../../.claude/skills/](../../.claude/skills/)** — all skills (Matt Pocock's plus this repo's own), shared at the zentro-eco workspace root.
- **[../../.agents/skills/](../../.agents/skills/)** — Codex-discoverable wrappers that mirror the workspace root's `.claude/skills/`.
