# Environment context surfaces per-view, not through a single global toolbar

Zentro's Project-centric design lets one project mix DB engines across environments (dev/staging/prod), and Table/Catalog tabs need to keep showing correct data even after the user switches environments elsewhere in the app. We decided the Toolbar's Server/DB/Schema area keeps exactly one fixed meaning — the execution target for Query tabs (the Active Environment) — and never changes based on which tab is focused. Table and Catalog tabs instead carry their own Pinned Environment, set once at open time and immutable for the tab's life, surfaced locally via an always-visible `[ENV] name` badge on the tab label (colored per the environment's fixed palette — dev blue, staging yellow, production red) with a hover popover for full connection detail (host/port/driver/etc., reusing the existing Toolbar connection popover). The Toolbar visually dims whenever a Table or Catalog tab is focused, to signal "this value isn't the truth for what you're looking at right now."

Side-by-side comparison is scoped to Table/Catalog tabs only. Query tabs never pin — running the same query against two environments in parallel is a distinct, unrequested feature, not part of this decision.

## Considered options

The Toolbar-dimming trigger was the one non-obvious call: dim only when multiple panes are open (structural), or dim whenever a pinned-context tab is focused regardless of pane count (semantic). Structural was rejected: a single already-open Table tab can silently drift out of sync with the Toolbar after a later, unrelated Active Environment switch, and a structural trigger would leave the Toolbar looking authoritative in exactly that case — reproducing the same kind of silent staleness this whole redesign exists to fix, just moved into the UI layer. The semantic trigger (`focused tab is Table or Catalog`) has no such gap.

## Consequences

- Write-safety confirmation dialogs are **not** yet styled to match the badge's environment color — deliberately deferred, not forgotten.
- Catalog tabs (index/view/routine/sequence definitions) get the same pin + badge treatment as Table tabs, since they're read-only "presentation layer" surfaces with the same staleness risk.
