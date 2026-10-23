# Architecture

Zentro is a single-binary desktop SQL IDE. This document explains **how the code is organized and why**, so any developer can navigate, extend, or refactor the codebase without external help.

> If you only have 5 minutes, read [§ Mental model](#mental-model) and [§ Where things live](#where-things-live). Then bookmark [docs/EXTENDING.md](docs/EXTENDING.md) for recipes.

---

## Mental model

```
                ┌──────────────────────────────────────────────┐
                │  Wails desktop window (single binary)        │
                │                                              │
   user input → │  React UI ──► services ──► wailsjs bindings  │
                │                                  │           │
                │                                  ▼           │
                │           ┌──────────────────────────────┐   │
                │  events ◄─┤ App (Go) — Wails-bound facade│   │
                │           └──────────────────────────────┘   │
                │             │                                │
                │             ▼                                │
                │           services  ──►  driver registry     │
                │             │              │                 │
                │             ▼              ▼                 │
                │         core/db        adapters: pg/my/ms/sq │
                └──────────────────────────────────────────────┘
```

**One bridge, one source of truth per concern.** The frontend never touches a database driver; the backend never touches the DOM. They speak via two paths only:

| Direction | Mechanism |
| --- | --- |
| FE → BE (request/response) | TypeScript method calls on `wailsjs/go/main/App` (generated from the `App` Go struct) |
| BE → FE (push) | Wails events with names defined in [internal/constant/events.go](internal/constant/events.go) |

Both sides import event names from a paired constant file ([frontend/src/lib/constants.ts](frontend/src/lib/constants.ts)) so a typo can't slip past compile.

---

## Where things live

### Backend (Go) — `internal/`

| Path | Role | What goes here |
| --- | --- | --- |
| `internal/app/` | Application layer | `App` struct + `app_*_facade.go` (thin Wails-exposed wrappers) + `*_service.go` (logic) + `event_emitter.go` (BE→FE push) |
| `internal/core/` | Plugin registry | Singleton `Register`/`Get` for drivers. Touched once from `main.go`. |
| `internal/driver/` | Ports & Adapters | `driver.go` defines 3 ports (`Connector`, `SchemaFetcher`, `QueryDialect`). One subdir per DB engine implements them. |
| `internal/db/` | Generic SQL plumbing | `executor.go`, `connector.go`, `schema.go`, `write_safety.go` (mutating-query guard). |
| `internal/models/` | Domain DTOs | Pure data: `ConnectionProfile`, `Project`, `SchemaNode`, `ColumnDef`, … No methods that talk to DB. |
| `internal/constant/` | Shared constants | Event names (paired with FE), other cross-package constants. |
| `internal/extensions/` | Optional features | `license/`, `plugin/` — gated by entitlements, not core. |
| `internal/utils/` | Cross-cutting | Logger factory, preferences I/O, path utilities. |

### Frontend (TypeScript) — `frontend/src/`

| Path | Role | What goes here |
| --- | --- | --- |
| `App.tsx` | Shell composition | Wires top-level layout + global hooks. **No business logic.** |
| `features/<x>/` | Feature modules | Sovereign — cannot relatively import from a sibling `features/<y>/`. Promote shared code out. |
| `components/ui/` | Design-system primitives | `Button`, `Input`, `Textarea`, `Dialog`, … — the **only** allowed form/control widgets in feature code. |
| `components/{layout,editor,viewers,sidebar,shared}/` | Composed shared UI | Bigger pieces reused across features. |
| `stores/` | State (zustand) | One store per concern: `editorStore`, `resultStore`, `schemaStore`, `connectionStore`, `projectStore`, `settingsStore`, … |
| `platform/apiGateway.ts` | Gateway seam | `getApiGateway()` adapters wrap every backend call; each method returns `KernelResult<T>` (`shared/kernel/`). Components/hooks call this directly, never `wailsjs` directly. Unwrap via `unwrapOrThrow` (throw-on-failure call sites) or an explicit `.ok` check (soft-fail/fallback call sites). |
| `services/` | Legacy/real-logic modules | Retired in favor of the gateway seam above wherever a module was pure pass-through. A new module belongs here only if it holds real logic beyond pass-through (e.g. `services/project/` — response mapping + error classification); `gitTrackingService.ts` is a stale pass-through left over from before this migration (zero callers — dead code, not yet removed). |
| `lib/` | Pure utilities | `commandBus.ts`, `queryBuilder.ts`, `shortcutRegistry.ts`, `sqlAliases.ts`, … No React, no Wails, no side effects. |
| `wailsjs/` | **Generated** | Created by Wails from the `App` Go struct. Never hand-edit. Regenerate via `wails dev` or `wails build`. |

---

## Design patterns in use

Each pattern was chosen to isolate a specific kind of change. Don't introduce a new pattern unless you can name the volatility it's protecting against.

| Pattern | Where | Protects against |
| --- | --- | --- |
| **Plugin Registry (Singleton)** | [internal/core/registry.go](internal/core/registry.go) | Adding a new DB engine. `main.go` registers; nothing else imports concrete drivers. |
| **Ports & Adapters** | [internal/driver/driver.go](internal/driver/driver.go) | Dialect drift (pagination syntax, schema introspection SQL). Adapters live in `internal/driver/{postgres,mysql,mssql,sqlite}/`. |
| **Interface Segregation** | `Connector` + `SchemaFetcher` + `QueryDialect` | Callers depend on the smallest interface that fits — `Connector` for connection code, `SchemaFetcher` for tree-builders. |
| **Facade** | `internal/app/app_*_facade.go` | Wails method binding. Facades **delegate only**; logic lives in `*_service.go`. |
| **Service objects** | `internal/app/*_service.go` | Each service owns one concern (query, connection, transaction, source-control). Constructor-injected via closures so state lives on `App`. |
| **Observer / EventEmitter** | [internal/app/event_emitter.go](internal/app/event_emitter.go) | Decouples BE from Wails runtime. Tests inject a fake emitter; only 4 BE files may import `wails/v2/pkg/runtime` (guardrail-enforced). |
| **Write-safety guard** | [internal/db/write_safety.go](internal/db/write_safety.go) | Foot-gun mutations (UPDATE/DELETE without WHERE). Runs before executor. |
| **Command Bus** | [frontend/src/lib/commandBus.ts](frontend/src/lib/commandBus.ts) | Cross-feature actions (shortcuts, menu items). Features `emit`, listeners react — no direct imports. |
| **Feature-first modules** | `frontend/src/features/<x>/` | Local reasoning. Each feature is a unit of ownership. Boundary enforced by `npm run check:frontend:boundaries`. |
| **Design-system contract** | [frontend/src/components/ui](frontend/src/components/ui) | Native `<button>/<input>/<textarea>` in features fail the FE guardrail. Forces consistent a11y + theming. |
| **Gateway seam** | [frontend/src/platform/apiGateway.ts](frontend/src/platform/apiGateway.ts) | Backend-call drift. One `getApiGateway()` adapter per domain returning `KernelResult<T>`, instead of ~15 hand-written `services/*` facades each re-solving error handling. |

---

## Lifecycle

```
main.go
   └─ core.Register(pg, my, ms, sq)
   └─ app := NewApp()              # services constructed with state closures
   └─ wails.Run(...)
        ├─ App.Startup(ctx)         # logger, prefs, audit hooks
        │     ▼
        │  (user interacts; queries run; events flow)
        │     ▼
        └─ window close
              └─ App.OnBeforeClose  # emits app:before-close
                    └─ FE persists tabs, then calls App.ForceQuit
                          └─ App.Shutdown # rollback tx, close db, flush log
```

GoDoc on each lifecycle method in [internal/app/app.go](internal/app/app.go).

---

## Boundaries enforced statically

These are checked by [scripts/verify-push.mjs](scripts/verify-push.mjs) (run by the pre-push hook). **A build fails if any of these break:**

| Rule | Script | What it catches |
| --- | --- | --- |
| BE event names must come from `constant/events.go` | `npm run check:backend:guardrails` | Hardcoded `runtime.EventsEmit(ctx, "schema:loaded", …)` |
| Wails runtime import fenced to 4 BE files | `npm run check:backend:guardrails` | Any `*_service.go` reaching for `runtime.EventsEmit` directly |
| No cross-feature relative imports | `npm run check:frontend:boundaries` | `features/foo` importing from `../bar/` |
| No native `<button>/<input>/<textarea>` in feature code | `npm run check:frontend:guardrails` | Bypassing design-system primitives |
| Design-system contract spec passes | `npm run check:frontend:design-system` | Component API drift |
| `wailsjs/go/models.ts` exists | `npm run check:wails-models` | Forgot to run `wails dev` after BE change |

If a guardrail is wrong, fix it — don't bypass. The pre-push hook can be skipped with `SKIP_PRE_PUSH_CHECKS=1` only in emergencies.

---

## State coupling (frontend)

Stores are the source of truth. Components subscribe; services mutate. Cross-store reads are fine; cross-store writes go through actions, not direct setters.

```
                 ┌─── connectionStore ──┐
                 │                      │
                 ├─── projectStore ─────┤
                 │                      │
   App.tsx ──────┼─── environmentStore ─┼──── components/features
                 │                      │
                 ├─── editorStore ──────┤
                 │                      │
                 ├─── resultStore ──────┤   (virtualized via @tanstack/react-virtual)
                 │                      │
                 └─── schemaStore ──────┘
```

Persistence: stores use zustand `persist` middleware for the parts that survive restart. Hydration happens before `App.tsx` mounts the main UI (see `useAppEventBridge`).

---

## Known tech-debt

These are NOT bugs — they're files that exceed the project's self-stated 400-LOC limit and would benefit from splitting. They're tracked here so refactors are intentional rather than opportunistic. See [docs/TECH-DEBT.md](docs/TECH-DEBT.md) for the full list with rationale.

Hotspots to know about before editing:

- **`frontend/src/features/editor/TableInfo/CheckConstraintsView.tsx`** (690 LOC) — mixes fetch + transform + render. Split candidate: per-constraint-type container + shared edit-modal hook.
- **`frontend/src/features/editor/MonacoEditor.tsx`** (810 LOC, down from 1047) — run-target resolution and 5 decoration managers (bookmark, preview, executed-line, schema-warning, ctrl-hover) already extracted to tested `frontend/src/lib/monaco/*` modules following the `setupX(editor, monaco, ...) => { update, clear, dispose }` factory shape (matches the pre-existing `setupRiskHighlight`/`setupStatementHighlight`). Still holds 7 stores, 7 command-bus handlers, drag-resize, and `handleMount`'s remaining ~150-line setup — deliberately out of scope for the decoration-manager pass (see issue #20). Any new editor-intelligence feature (inline per-statement errors, etc.) should follow the same `lib/monaco/` factory pattern rather than growing this file further.
- **`internal/app/git_tracking_service.go`** (816 LOC) and **`source_control_service.go`** (732 LOC) — large surfaces (32 and ~20 public methods). Split candidate: separate `diff`, `commit`, `log` sub-services.
- **`internal/app/app.go`** has 88 public methods across facades. Adding a method is fast; *finding* the right facade is not. Use [docs/EXTENDING.md](docs/EXTENDING.md) recipes.

---

## Quick links

- **Want to extend the app?** → [docs/EXTENDING.md](docs/EXTENDING.md) for recipes.
- **Decision history?** → [docs/adr/](docs/adr/) for ADRs.
- **AI agent guidance?** → [CLAUDE.md](CLAUDE.md) for the dense agent summary and [AGENTS.md](AGENTS.md) for AGENTS-aware tools such as Codex.
- **Engineering charter?** → [docs/ENGINEERING.md](docs/ENGINEERING.md) — mission, SOLID rules, anti-patterns.
