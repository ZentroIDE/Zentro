# CLAUDE.md

Dense reference for Claude Code agents working in this repo. **The canonical, human-readable source of truth is [ARCHITECTURE.md](ARCHITECTURE.md) + [docs/](docs/)** — this file mirrors only what an agent needs scanned every turn.

## What this is

Zentro: Wails v2 desktop SQL IDE (Postgres, MySQL, SQL Server, SQLite). Go backend + React 18 + TypeScript + Vite frontend, single binary. Wails generates TS bindings under `frontend/wailsjs/` from the `App` struct in [main.go](main.go).

## MUST SCAN BEFORE EDITING

Violating these breaks the pre-push gate. If your change isn't covered, open the named file.

### BE pattern map (Go)
- **Plugin registry (Singleton)** — [internal/core/registry.go](internal/core/registry.go). Drivers self-register in [main.go](main.go). Get via `core.Get(name)` — never import driver packages elsewhere.
- **Ports & Adapters** — [internal/driver/driver.go](internal/driver/driver.go) splits into ISP-segregated ports: `Connector`, `SchemaFetcher`, `QueryDialect`. Dialect-specific SQL/DDL lives only in `internal/driver/{postgres,mysql,mssql,sqlite}/`.
- **App Facade (Singleton)** — [internal/app/app.go](internal/app/app.go) is the only Wails-bound type. `app_*_facade.go` are THIN wrappers (≤3 lines, delegate only). Logic → `*_service.go`. Facade-to-service mapping: one service → one facade file (e.g. `app_connection_facade.go` → `connection_service.go`). Cross-cutting or tier-specific concerns get their own file (`app_entitlement_facade.go`, `app_policy_facade.go`, `app_team_facade.go`).
- **Services** — one file per concern (`query_service.go`, `connection_service.go`, `transaction_service.go`, `schema_service.go`, `git_tracking_service.go`, …). Dependencies injected via closures; no package-level state.
- **Observer / EventEmitter** — BE→FE only through `EventEmitter` ([internal/app/event_emitter.go](internal/app/event_emitter.go)). Event names come from [internal/constant/events.go](internal/constant/events.go).
- **Write-safety** — [internal/db/write_safety.go](internal/db/write_safety.go) guards mutating SQL. Don't bypass.

### FE pattern map (TS/React)
- **Feature-first** — `frontend/src/features/<x>/` is sovereign. Cross-feature relative imports blocked. Shared code → `components/`, `lib/`, `services/`, `stores/`.
- **Zustand stores = source of truth** — one store per concern. Derive view state; don't sync booleans.
- **Gateway seam over wailsjs** — components/hooks call `getApiGateway()` ([frontend/src/platform/apiGatewayRuntime.ts](frontend/src/platform/apiGatewayRuntime.ts)) directly, unwrapping the `KernelResult<T>` each adapter method returns; never `wailsjs/go/main/App` directly. `wailsjs/` is generated — never hand-edit. See [ARCHITECTURE.md](ARCHITECTURE.md) for the unwrap conventions and when a `frontend/src/services/*` module still belongs.
- **Design-system primitives** — controls from [frontend/src/components/ui](frontend/src/components/ui). Native `<button>/<input>/<textarea>` in feature code fail FE guardrails.
- **Command bus** — cross-feature actions via [frontend/src/lib/commandBus.ts](frontend/src/lib/commandBus.ts).
- **Event constants paired with BE** — [frontend/src/lib/constants.ts](frontend/src/lib/constants.ts) mirrors `internal/constant/events.go`.

### Boundary cheatsheet (build-breaking)
| Rule | Enforced by |
| --- | --- |
| BE events from `constant/events.go` only | `npm run check:backend:guardrails` |
| Wails runtime import fenced to 5 BE files | `npm run check:backend:guardrails` |
| No cross-feature relative imports | `npm run check:frontend:boundaries` |
| No native form controls in feature code | `npm run check:frontend:guardrails` |
| Design-system contract spec | `npm run check:frontend:design-system` |
| `frontend/wailsjs/go/models.ts` exists | `npm run check:wails-models` |
| Core never references a Pro symbol (`pro_*`, `frontend/src/pro/`, ADR 0019) | CI job `public-tree`, `npm run verify:push` |
| No import into `frontend/src/pro/` from outside it except `import.meta.glob` | `npm run check:frontend:boundaries` |

### Required pre-edit reads
- **New Wails-exposed method** → recipe in [docs/EXTENDING.md § 2](docs/EXTENDING.md) (≥5 files).
- **New driver** → recipe in [docs/EXTENDING.md § 1](docs/EXTENDING.md) + [internal/driver/driver.go](internal/driver/driver.go).
- **New event** → [docs/EXTENDING.md § 3](docs/EXTENDING.md) — must edit BOTH `internal/constant/events.go` AND `frontend/src/lib/constants.ts`.
- **New UI feature** → [docs/EXTENDING.md § 4](docs/EXTENDING.md).
- **New Pro feature** → [docs/EXTENDING.md § 6](docs/EXTENDING.md) + [docs/adr/0019-open-core-gpl-pro-build.md](docs/adr/0019-open-core-gpl-pro-build.md).
- **New System Settings section** → `settings-section` skill (workspace-root `.claude/skills/settings-section/SKILL.md`).
- **Touching a fat file (>400 LOC)** → check [docs/TECH-DEBT.md](docs/TECH-DEBT.md) first to know the planned refactor direction.

## Common commands

### Develop
- `wails dev -tags dev` — hot-reload (Go + Vite); the `dev` tag enables the `ZENTRO_DEV_TIER` license override and debug tools.

### Build
- `npm run build` → `build_zentro.ps1` (Windows + NSIS installer). `npm run build:dev` for dev artifact.
- `wails build` for ad-hoc cross-platform.
- **Guardrails run automatically inside the build.** `build_zentro.ps1` runs `check:backend:guardrails` before invoking `wails build`; the frontend's own `npm run build` (called by Wails) runs `check:frontend:guardrails` + `check:frontend:boundaries` + `check:frontend:design-system` + `tsc` before `vite build`. A failing guardrail aborts the build with the script's exit code — don't bypass.

### Test
- `npm run test:backend` → `go test ./... -coverprofile=coverage-backend.out`.
- `go test ./internal/app/... -run TestName` → single backend test.
- `npm run test:frontend` → vitest with coverage.
- `cd frontend && npx vitest run src/path/file.test.ts` → single FE test.

### Format
- `npm run format` — gofmt + prettier (pre-commit hook runs this).

### Verification gates (REQUIRED before commit/push)
- `npm run check:backend:guardrails`
- `npm run check:frontend:guardrails`
- `npm run check:frontend:boundaries`
- `npm run check:frontend:design-system`
- `npm run verify:push` — runs the full pre-push gate ([scripts/verify-push.mjs](scripts/verify-push.mjs)). Skip only via `SKIP_PRE_PUSH_CHECKS=1` in genuine emergencies.

### Git hooks
- `npm run hooks:install` — installs `.githooks/pre-commit` and `.githooks/pre-push`.

## Conventions

- **Go**: small focused interfaces; constructor-injected; no package-level mutable state except `internal/core/registry.go`.
- **Frontend**: feature-first, no `any`, derive view state, design-system primitives only in feature code.
- **License headers**: every tracked `.go`/`.ts`/`.tsx` file needs an SPDX line (`GPL-3.0-only`, or `LicenseRef-Zentro-Commercial` for a `pro_*` file) — a new file without one fails `npm run check:spdx` (part of `verify:push`). Run `npm run gen:spdx` to add missing ones.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, …). `npm run release` bumps `package.json` + `wails.json` together via [.versionrc.cjs](.versionrc.cjs).
- **Branching**: feature branches off `dev`, PR into `dev`.
- **Releasing**: cut from `main`, author `release-notes/vX.Y.Z.md`, `npm run verify:push`, `npm run release`, `git push --follow-tags origin main`. Full contract: [docs/rules/release.md](docs/rules/release.md); automated by the `zentro-release` skill.

## Agent skills

Skills live one level up, at the zentro-eco workspace root's `.claude/skills/` (shared across all repos in the workspace), not inside this repo. Engineering skills from [mattpocock/skills](https://github.com/mattpocock/skills) are installed there (managed by `npx skills` run from the workspace root, pinned in `../skills-lock.json`), alongside this repo's own app-specific skills (`01-project-architecture`, `go-wails-sql-client-definition`, etc. — formerly under `.agent/skills/`). Codex reads matching generated wrappers from the workspace root's `.agents/skills/` so both agents share the same skill entrypoints and repo overlays. Run `npm run sync:agent-skills` (from this repo) after updating the workspace root's `.claude/skills/`. Per-repo config lives in `docs/agents/`.

### Jev (TypeSafe)

For fuzzy decisions (routing, classification, scoring, replacing fragile parsing) use the `typesafe-ai` skill. Guardrails in `../.claude/skills/18-jev-guardrails/SKILL.md`: never send connection credentials, query text or result rows; the desktop app must not embed the `TYPESAFE_API_KEY`, so any product use goes through `zentro-api`.

### Issue tracker

Issues live in GitHub Issues (`ZentroIDE/Zentro`) via the `gh` CLI; external PRs are NOT a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

## When you need more

Don't duplicate this content elsewhere. If you need detail beyond this file, follow the link:

- **Mental model + design patterns + lifecycle** → [ARCHITECTURE.md](ARCHITECTURE.md).
- **Recipes (extending the app)** → [docs/EXTENDING.md](docs/EXTENDING.md).
- **Engineering charter (mission, SOLID, anti-patterns)** → [docs/ENGINEERING.md](docs/ENGINEERING.md).
- **Decision history** → [docs/adr/](docs/adr/).
- **Tech debt + known fat files** → [docs/TECH-DEBT.md](docs/TECH-DEBT.md).
- **Focused rules** → [docs/rules/](docs/rules/) (architecture, coding-style, commit-convention, release).
