# Extending Zentro

Six recipes covering the most common changes. Each recipe is a checklist — if you finish without ticking every box, something is missing.

For background on why the architecture is shaped this way, see [../ARCHITECTURE.md](../ARCHITECTURE.md).

---

## 1. Add a new database driver

**Total: 2 files (1 new directory).**

Touch-points:

- [ ] **Create `internal/driver/<name>/`** with one file (e.g. `duckdb.go`).
- [ ] **Implement the three ports** from [internal/driver/driver.go](../internal/driver/driver.go):
  - `Connector` — `Name()`, `Open()`, `FriendlyError()`
  - `SchemaFetcher` — `FetchDatabases`, `FetchSchema`, `FetchTableColumns`, etc.
  - `QueryDialect` — `InjectPageClause`, `DefaultSchema`
- [ ] **Add an exported `New() DatabaseDriver`** factory.
- [ ] **Register it in [main.go](../main.go)**:
  ```go
  import duckdriver "zentro/internal/driver/duckdb"
  // ...
  core.Register(duckdriver.New())
  ```
- [ ] If the driver uses a side-effect-registered SQL driver, add a blank import in `main.go`.
- [ ] **Add a test in `internal/driver/driver_contract_test.go`** — the contract test runs the same suite against every driver.
- [ ] **Run** `wails dev` once so the FE driver picker discovers the new name.

**Do NOT touch:** frontend code, `internal/app/`, `internal/db/`. The new driver is auto-discovered through the registry.

---

## 2. Add a new Wails-exposed method (BE → FE call)

Example: `App.DescribeTrigger(schema, name string) (TriggerInfo, error)`.

**Total: ~5–7 files depending on whether it persists state, emits events, or needs FE store.**

Touch-points:

- [ ] **Pick or create the right facade file** in `internal/app/app_*_facade.go`.
  - If it's about an existing concern (schema, query, connection, source-control, git-tracking, …), use the existing `app_<concern>_facade.go`.
  - If it's a new concern, create a new facade file. Don't add to `app.go` itself.
- [ ] **Add the public method on `App`** (in the facade file). The body should be ≤3 lines and delegate to a service:
  ```go
  func (a *App) DescribeTrigger(schema, name string) (*models.TriggerInfo, error) {
      return a.schema.DescribeTrigger(a.ctx, a.db, schema, name)
  }
  ```
- [ ] **Implement logic in `internal/app/<concern>_service.go`** (not in the facade).
- [ ] **If you emit an event** to push results to FE:
  - Add a `const Event* = "namespace:verb"` to [internal/constant/events.go](../internal/constant/events.go).
  - Call `a.emitter.Emit(ctx, constant.EventX, payload)` — never `runtime.EventsEmit` directly outside the 4 fenced files.
  - Add the matching constant to [frontend/src/lib/constants.ts](../frontend/src/lib/constants.ts) (DOM_EVENT or similar).
- [ ] **Add a return-type model** if needed in `internal/models/`.
- [ ] **Run `wails dev` once** to regenerate `frontend/wailsjs/go/main/App.d.ts` + `models.ts`.
- [ ] **Add an FE service facade** in `frontend/src/services/<concern>Service.ts`:
  ```ts
  import { DescribeTrigger } from "../../wailsjs/go/main/App";
  export const describeTrigger = (schema: string, name: string) =>
      DescribeTrigger(schema, name);
  ```
- [ ] **Call the service from a component, hook, or store** — never from `wailsjs/` directly.
- [ ] **Write a Go test** in `<concern>_service_test.go` and an FE test in `<concern>Service.test.ts` if there's any transform.

**Common miss:** forgetting to add the event constant to **both** sides (BE constant + FE constant). Guardrails catch the BE side only.

---

## 3. Add a new event (BE pushes data to FE)

**Total: 3 files.**

- [ ] **Define the constant** in [internal/constant/events.go](../internal/constant/events.go):
  ```go
  EventSchemaRefreshed = "schema:refreshed"
  ```
- [ ] **Emit it** from a service via `a.emitter.Emit(ctx, constant.EventSchemaRefreshed, payload)`.
- [ ] **Mirror the constant** in [frontend/src/lib/constants.ts](../frontend/src/lib/constants.ts):
  ```ts
  export const DOM_EVENT = {
      // ...
      SCHEMA_REFRESHED: "schema:refreshed",
  } as const;
  ```
- [ ] **Subscribe from a feature module** via `useAppEventBridge` (already exists) or `EventsOn(...)`.

**Why pair them:** the guardrail asserts BE uses a constant. The FE has no such guardrail, so we rely on convention. Always update both files in the same commit.

**Other wire-paired vocabularies:** the same rule applies to every value set that crosses BE↔FE, not just events. Currently paired in `internal/constant/constants.go` ↔ `frontend/src/lib/constants.ts`: drivers (`Driver*` ↔ `DRIVER`), connection status, transaction status, tab types, safety levels (`SafetyLevel*` ↔ `SAFETY_LEVEL`), and environment strictness (`EnvironmentStrictness*` ↔ `ENVIRONMENT_STRICTNESS`). Adding a value to one side without the other is a bug.

---

## 4. Add a new feature module (frontend)

**Total: 1 directory (no other touch-points if isolated).**

- [ ] **Create `frontend/src/features/<myfeature>/`**.
- [ ] **Inside it**, organize freely — typical layout:
  ```
  features/myfeature/
    useMyFeature.ts       # hook (the entry point most callers use)
    MyFeaturePanel.tsx    # presentational component
    myFeatureStore.ts     # ONLY if state is local to this feature
    types.ts
  ```
- [ ] **Allowed imports** from inside this feature:
  - `../../components/ui/*` — design-system primitives
  - `../../components/{layout,editor,viewers,sidebar,shared}/*` — bigger reusable UI
  - `../../stores/*` — global zustand stores
  - `../../services/*` — Wails facades
  - `../../lib/*` — pure utilities
- [ ] **Forbidden imports**:
  - `../<otherfeature>/*` — cross-feature relative imports (will fail `npm run check:frontend:boundaries`)
  - `../../../wailsjs/*` — go through `services/` instead
  - Native `<button>/<input>/<textarea>` — use `components/ui/Button` etc.
- [ ] **Need cross-feature communication?** Use the command bus: emit via `lib/commandBus.ts` from feature A, listen in feature B.
- [ ] **Need new global state?** Create a store in `frontend/src/stores/` (not inside the feature). Local state stays inside the feature.

**Test:** at least one `*.test.ts` for the hook or transform logic. Component-level snapshot tests are discouraged.

---

## 5. Add a new design-system primitive

You'll know you need this when ≥3 features start re-implementing the same control.

**Total: 2 files.**

- [ ] **Create the primitive** in `frontend/src/components/ui/<Name>.tsx`. Build on Radix UI or `class-variance-authority` — see existing primitives for the pattern.
- [ ] **Export it** from `frontend/src/components/ui/index.ts`.
- [ ] **Update the design-system contract spec** if the primitive has API guarantees: `frontend/src/components/ui/designSystemContract.test.tsx`.
- [ ] **If it replaces a native control** that was previously allowed in the FE guardrail allowlist, remove it from the allowlist in `scripts/check-fe-guardrails-lib.mjs`.

**Caveat:** every UI primitive is a long-term commitment. Prefer composing existing ones first.

---

## 6. Add a Pro feature

Background: [ADR 0019](adr/0019-open-core-gpl-pro-build.md). Pro code is found by **path**, not a build tag: the core never references a symbol defined in a Pro file, and CI proves it by exporting the tree without those files and building and testing it (job `public-tree`; same thing locally via `npm run verify:push`).

- [ ] **Backend logic that extends a core pipeline (hook, type B):** add a `pro_*.go` file in the same package as the code it extends (e.g. `internal/app/pro_ai_approval_friction.go`). It can use that package's unexported helpers — no API to export. Register from `init()` with the hook the core already defines, or a registry the core exposes for exactly this (`registerApprovalFriction`, `registerWriteGuard`, `onWire`/`onStartup`/`onShutdown` in `edition.go`). Never call Pro code from a non-`pro_*` file.
- [ ] **Backend infrastructure the core needs a default for (type C):** define the interface and a no-op/local default *in a core file* (e.g. `SecretProtector`, `license.Entitlements`). The Pro implementation is a `pro_*.go` file that wires itself in via `onWire`.
- [ ] **A feature id or limit:** the id constant and its free-tier meaning live in core (`features_core.go`, `contracts.go`); a paid id and its tier go in `pro_features.go` / `pro_catalog.go`, registered with `license.RegisterFeatures` from `init()`. Never read a Pro-only catalog value as the default a tree with no license service falls back to — `LocalEntitlements` must stand on its own (see `internal/extensions/license/entitlements.go`).
- [ ] **Additive UI (type A):** goes in `frontend/src/pro/`, loaded through the Plugin registry via `import.meta.glob` from one core bootstrap file — never a static `import` from outside `frontend/src/pro/` (enforced by `npm run check:frontend:boundaries`).
- [ ] **Tests:** a test that needs the Pro implementation (a real license service, a Pro service's behavior) is itself a `pro_*` file. A core test that merely needs *some* value (e.g. a project-count cap) should construct that value inline rather than depend on which edition wired `NewApp()`.
- [ ] **Verify:** `node scripts/export-public.mjs --out <empty dir> --verify --frontend` must end with "The public tree builds and passes its tests on its own." `npm run verify:push` runs the same check.

**Caveat:** this only works because a `pro_*.go` file sits in the same package as the core — there is no `internal/pro` package to import, so there is nothing a boundary-import guardrail could catch on the Go side. The guardrail *is* the build of the exported tree; if you can make the core call something only a `pro_*` file defines, the next `public-tree` CI run is how you'd find out, not a lint rule.

---

## Cross-cutting: where does my code go?

| Code shape | Backend | Frontend |
| --- | --- | --- |
| One DB engine's quirk | `internal/driver/<engine>/` adapter | n/a — FE never knows |
| Method exposed to FE | facade in `internal/app/app_<concern>_facade.go` | called via `frontend/src/services/<concern>Service.ts` |
| Business logic, no FE call | `internal/app/<concern>_service.go` | `frontend/src/lib/` (pure) or feature hook |
| Persistent state | `internal/models/` DTO + service field | `frontend/src/stores/<x>Store.ts` (zustand) |
| Reusable UI control | n/a | `frontend/src/components/ui/` (primitive) or `components/<bucket>/` |
| One-feature UI | n/a | `frontend/src/features/<myfeature>/` |
| Cross-feature action | event constant + emitter | command bus (`lib/commandBus.ts`) |
| Pure helper used in 2+ places | `internal/utils/` | `frontend/src/lib/` |

---

## When you're stuck

1. Check [ARCHITECTURE.md](../ARCHITECTURE.md) for the pattern map.
2. Find the closest existing peer (an existing service, feature, or primitive) and copy its structure.
3. Run `npm run verify:push` early and often — guardrails will tell you when you've crossed a boundary.
4. If the change doesn't fit any recipe above, write a short ADR in [docs/adr/](adr/) before writing code. It forces clarity.
