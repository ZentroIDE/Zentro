# ADR-0009 - Project-centric source control with automation

Issue 13 resolves the old split between `GitTracking` and `SourceControl` by making Source Control the single project repository and history. Project-owned SQL assets live with the project: `SavedScript` files are stored directly under `scripts/queries/...`, schema snapshots live under `artifacts/source-control/...`, automation state moves onto the `Project` model as capability flags, and automation-generated commits use the `zentro.sc.*` prefix while manual commits keep the user's message unchanged.
