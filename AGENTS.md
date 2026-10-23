# AGENTS.md

This repository expects coding agents such as Codex, Claude, Gemini, or similar
tools to read the local agent guidance before making changes.

## Startup Contract

Before implementing anything, read these files in order:

1. `.agent/rules/ai-behavior.md`
2. `.agent/rules/task-orchestration.md`
3. `../.claude/skills/go-wails-sql-client-definition/SKILL.md`
4. The relevant `SKILL.md` files under the workspace root's `.claude/skills/`
5. The matching workflow under `.agent/workflows/` when applicable

Do not start coding until the applicable rules, skills, and workflow are loaded.

## Non-Negotiable Priorities

All implementation decisions must align with this product order:

1. reliability
2. maintainability
3. performance
4. visual polish

The app goal is a reliable, local-first desktop SQL client with explicit,
practical UX and safe extension over time.

## Required Decision Filters

Before and during implementation, confirm:

- the chosen approach respects architecture boundaries
- the design pattern is the smallest justified pattern
- the code follows SOLID and stays DRY without introducing speculative abstraction
- the change keeps future maintenance and extension safer, not harder
- backend driver details do not leak across layers
- behavior stays observable and explicit

If the change conflicts with these rules, stop and re-plan before coding.

## Required Skills For Implementation Work

At minimum, align with:

- `../.claude/skills/01-project-architecture/SKILL.md`
- `../.claude/skills/12-zentro-design-patterns-enforcer/SKILL.md`
- `../.claude/skills/16-maintainability-flexibility-extensibility/SKILL.md`
- `../.claude/skills/go-wails-sql-client-definition/SKILL.md`

If the task touches frontend UX, also read:

- `../.claude/skills/15-frontend-design/SKILL.md`

## Cross-Agent Skills

- All skills (Matt Pocock's plus this repo's own app-specific ones) live at the zentro-eco workspace root's `.claude/skills/`, shared across every repo in the workspace
- Claude uses the canonical skills there directly
- Codex uses generated wrappers under the workspace root's `.agents/skills/`
- Run `npm run sync:agent-skills` (from this repo) after updating the workspace root's `.claude/skills/` so both agents keep the same skill names, descriptions, and behavior entrypoints
- Repo-specific overlays for those skills live under `docs/agents/`
- When a skill is relevant, agents should follow the wrapper/canonical chain and then apply this repo's local rules from `AGENTS.md` and `.agent/`

## Jev (TypeSafe System One)

When a task adds a fuzzy decision (routing, classification, scoring, replacing fragile
parsing), use `../.claude/skills/typesafe-ai/SKILL.md`. Data and key rules are in
`../.claude/skills/18-jev-guardrails/SKILL.md`: never send connection credentials,
query text, or result rows, and never embed `TYPESAFE_API_KEY` in the desktop app.

## Verification Expectations

Before finalizing:

- run targeted verification for the changed area
- run `node scripts/check-fe-guardrails.mjs` for frontend-impacting changes
- expect `.githooks/pre-commit` to format and enforce frontend guardrails
- summarize residual risk when verification is incomplete

## Commit Expectations

Follow:

- `../.claude/skills/13-commit/SKILL.md`

Use conventional commits and keep diffs minimal and traceable to the task.
