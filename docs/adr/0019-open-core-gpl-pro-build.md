# ADR 0019 — Open core: GPL-3.0, Pro build, and Pro attachment points

- **Status**: accepted
- **Date**: 2026-10-17
- **Decision drivers**: Zentro is a private repo with an MIT `LICENSE`, Free and Pro code in one tree behind scattered `CanUse(...)` checks, and a release build that can still contain the dev license provider; making the core public while still selling Pro needs a license, a physical split, and a repeatable way for Pro to attach to core (epic #124)

## Context

Zentro is a Wails v2 desktop SQL IDE. The long-term shape is a VS Code-like data IDE: an open core plus paid Pro, Team, and Enterprise. Today the code is in one private repo, the license file says MIT, and Free and Pro features are mixed across services and components.

Four problems must be solved before the core can be public:

1. **The license gate is breakable.** Release builds do not use `-tags production`, so `pro_dev_provider.go` still ships in the binary. Public code makes that bypass obvious.
2. **Pro code must not appear in the public repo**, including its git history, and the official download must still be able to unlock Pro (a trial, then payment) without a reinstall.
3. **The legal story must be explicit**: license, copyright owner, CLA, trademark, dependencies.
4. **Operations must fit one person**: one distribution channel, little infrastructure, and no flood of community issue noise.

This record fixes the decisions D1–D8 from epic #124. The later implementation issues (#126–#139) all depend on it.

**Naming.** "Zentro" on its own always means the official build (Pro code present, locked behind an entitlement). The build anyone gets by cloning the public repo and running it themselves is **Zentro Community Edition (CE)** — it needs the qualifier because it is the special case, not the default (same pattern as n8n, Appsmith, Odoo). This is distinct from a GitLab/Mattermost-style "CE vs. EE" pair, where both are named editions of equal standing — see "DBeaver-style separate editions" under Alternatives for why that pattern was rejected here.

## Decision

### License

The core is **GPL-3.0-only**.

- GPL-3.0 is chosen over permissive licenses because it prevents a competitor from closing and reselling the core without giving changes back. Zentro is not monetized by hiding the core; Pro, Team, and Enterprise are the product.
- Companies that **use** Zentro internally have no obligations. GPL duties are triggered by distributing the work, not by running it inside a business.
- `-only` (not `-or-later`) keeps future re-licensing in the owner's control, exercised through the CLA.
- AGPL-3.0 is rejected because it is the one license many companies ban outright, and its network-copyleft clause is aimed at hosted services, which Zentro is not.

### Repository model

- **One private repo is the source of truth.** A public tree is **exported automatically** from it, not forked, with a fresh history. Pro code is never committed to, or present in the history of, the public repo. (GitLab and PostHog work the same way: the full repo plus a read-only mirror with the proprietary code removed.)
- **Pro files are found by path, and the export drops them.** The convention: Go files named `pro_*.go` (or a `pro/` directory for a whole package), and `frontend/src/pro/` for the UI. A Go Pro file sits in the same package as the code it extends, so it can use that package's unexported helpers and the core does not have to export an API for it.
- **No build tags and no stubs.** The core defines registries and interfaces with Free behavior; each Pro file registers itself from an `init()` or a blank import that exists only in the private tree. The public tree therefore contains no Pro file, no `pro` tag and no stub, and it builds and passes its tests on its own. CI proves it by building and testing the exported tree.
- **Prebuilt Zentro CE binaries are a trust artifact, not a second product** (amended 2026-10-23; D6 originally said none). Each release also carries unsigned `zentro-ce-*` files built by GitHub Actions in the public repository from the release tag, with `SHA256SUMS-ce.txt`. The official download stays one binary, Zentro (see Distribution), with one update channel: CE has no updater, no landing-page download, and is not registered with zentro-api.

### Pro attachment points

Pro never patches core code. It attaches through three kinds, chosen per feature:

- **A — additive UI.** Pro registers UI through the existing plugin registry in `frontend/src/lib/plugin/` and `internal/extensions/plugin/`. Examples from #131: query stats registers a bottom/result panel; schema-rollback UI registers a command and a source-control contribution; PII detection and screen blur register a cell renderer/toolbar item; upgrade UI, license modal, and plan status register toolbar/slot contributions and are absent from Zentro CE.
- **B — core-defined hooks in a pipeline.** Core owns the chain and its Free behavior; Pro registers additional guards or tools. The concrete example is the **WriteGuard chain** in `internal/app/query_preflight.go` (today the type-to-confirm, cooldown, reason-audit, production-unlock, affected-rows/sandbox-preview, and required-schema-snapshot checks).
- **C — core interfaces with Pro implementations.** Used for infrastructure that runs at startup or replaces a core component. Examples from #130: app lock becomes `StartupGate`, the secret vault becomes `CredentialProtector`, and the license client becomes `EntitlementSource`. Core ships a no-op or Free implementation. A build from the public tree has no license client and never calls the license server.

### Boundary rule

Core **never references a symbol defined in a Pro file** (`pro_*.go`, `pro/`, `frontend/src/pro/`). The tree without those files must work fully: connect to every supported database, run queries, browse schema, use git tracking, use the AI assistant with a BYO key, and run the MCP server — with no Pro UI and no requests to the license server. The guardrail is the build itself: CI exports the tree and builds and tests it (#132).

### Distribution, trial and upgrade

- **Zentro (the official binary) contains the Pro code, locked.** It is the one thing users download from the landing page. Without an entitlement it behaves as the Free plan. Anyone who patches the binary can unlock it; Grafana, Mattermost and JetBrains accept the same trade-off. The public source stays free of Pro code, while Zentro itself is not purely open.
- **A 30-day Pro trial starts from inside the app**, as JetBrains does. The server grants it as a signed Pro entitlement with `source: trial` and an expiry, bound to the installation and a verified email, one per email and machine. When it ends the app falls back to Free and keeps the user's data. There is no client-side trial counter.
- **Paying upgrades the running app.** After checkout the app refreshes its entitlement when the user comes back (window focus or a deep link), so Pro, Team and Enterprise need no reinstall. Team and Enterprise use the same signed envelope, extended with an organisation and seats; an offline license file for airgapped Enterprise comes later.
- **Build from source stays Free.** Letting a source build upgrade and keep its custom code needs either Pro source published under a commercial license or Pro delivered as a signed add-on over a stable API. Neither is decided; the export denylist makes the first a one-line change, and keeping the Pro seams small and data-shaped keeps the second open.

### Plan entitlements

- **BYOK AI is free on every plan.** The user brings the model key, so the assistant costs Zentro nothing to run, and competing tools charge for AI, so a free assistant sets Zentro apart. Separately, ADR 0017 keeps the data-protection floor free on every plan.
- **The whole assistant is free** (decided 2026-10-18): the chat, the MCP server and every tool, including the activity tools (`list_audit`, `get_git_status`, `get_query_stats`) and Data mode. ADR 0015 and 0017 are updated to match. Only the query statistics *panel* stays Pro (`query.stats`); the assistant reads the same collected data without that check.
- **One catalog.** A feature is declared once, in Go, with the lowest tier that includes it (`license.RegisterFeatures`; `features_core.go` for Free, `pro_features.go` for paid). The per-tier catalogs are derived from that registry, and the frontend's fallback matrix (`entitlementMatrix.ts`) is generated from it with `npm run gen:entitlements`; the build and CI fail when the two differ. The Pro package registers its features the same way, so the core never has to list a paid feature.

### GPL consequences

- **A CLA is required for outside contributions.** The owner is the sole copyright holder so far, which is what lets closed Pro code be distributed alongside the GPL core. Contributions must assign or license the rights needed to keep that option.
- **No third-party GPL code in core or Pro.** A CI dependency-license check enforces this.
- **No Mac App Store.** GPL and Apple's App Store terms conflict; the official Mac build is distributed outside the store.
- **Paid third-party extensions** that need a non-GPL license will require a separate extension-exception ADR before a marketplace exists.

### Out of scope

- Extension runtime loading, sandboxing, and marketplace (later roadmap).
- Team, Enterprise, SSO, and RBAC.
- Trademark registration (deferred until there is revenue).

## Alternatives considered

- **MIT** — maximum adoption, but a competitor can close and sell the core with no reciprocity.
- **Apache-2.0** — patent grant is attractive, but it is still permissive for the code that makes the product's moat.
- **MPL-2.0** — fits open core without a CLA, but its file-level copyleft lets anyone ship closed code alongside the core, so a competitor could build a closed product on it as long as edits to core files are shared.
- **AGPL-3.0** — solves hosted-service avoidance, but Zentro is a local app, and it is the license most commonly banned by companies.
- **FSL/BSL** — source-available with a future open date, but it weakens the "open core" promise and keeps the core effectively closed for years.
- **DBeaver-style separate editions** — a free community build plus a commercial build; it means maintaining two product surfaces instead of one source tree with Pro attachments.
- **Beekeeper-style GPL community plus commercial edition** — closest to what is chosen here, but we add a single private source-of-truth repo and automatic export so Pro code never enters public history.

## Consequences

- **Positive** — Pro files are found by path, so export is deterministic and checkable by building the exported tree; the community can audit and build Zentro CE from source; one Zentro binary serves Free, trial and paid users with no reinstall; day-to-day work stays in one tree.
- **Negative** — the owner must operate the export pipeline and the public repo; every external PR needs a CLA and must be carried back into the private tree; no Mac App Store; Pro features must be designed as attachments up front rather than as `if CanUse(...)` branches; the Wails bindings differ between the two trees and the export must regenerate them; Zentro ships locked Pro code that a determined user can patch open.
- **Neutral** — existing `useFeatureGate`/`CanUse` call sites migrate to the A/B/C points over the Phase 2 issues, not all at once.

## How to revisit

- If a Pro feature cannot be expressed through A, B, or C without the core referencing a Pro file, revisit the attachment model.
- If trial abuse becomes a real cost, tighten the trial's identity checks before changing the model.
- If users ask to upgrade a source build and keep their changes, choose between publishing Pro source under a commercial license and a signed add-on over a stable API, in a new ADR.
- If a third party needs to sell a GPL-incompatible extension, write the extension-exception ADR before opening a marketplace.
- If a second copyright holder is added or the project is transferred, re-examine the `-only` choice and the CLA terms.
- If GPL friction with enterprises becomes material, re-license only through the CLA path that `-only` preserves.
