# ADR 0018 — The workspace opens without a project

- **Status**: accepted
- **Date**: 2026-10-15
- **Decision drivers**: a first-time user saw only a create-project wizard and could not look around before committing; a user whose auto-open failed was pushed back into that wizard even though projects existed
- **Supersedes**: the startup behavior where the project wizard was the empty state (`App.tsx` rendered `ProjectHub startupMode` and never mounted `AppShell` without an active project)

## Context

A project is a folder on disk (`project.json`, scripts, a git repo) plus a registry entry. Everything user-authored lives inside it. The app used to require one before it showed anything, so the first screen was a form. `OpenProjectFromDirectory` existed in the backend with no UI.

## Decision

1. **The full workspace always mounts** once startup is ready. With no active project, the main area shows **Welcome**: New Project, Open Project Folder…, and Recent projects.
2. **No project means nothing to author.** Query, table, compare and git tabs cannot be created (`addTab` refuses). App-level tabs (Settings, Shortcuts) still open. The sidebar shows a short prompt with the same two actions instead of its project-scoped panels.
3. **Open Project Folder only opens an existing Zentro project** (a folder with `project.json`). A foreign folder is reported with a "Create new project" action. Zentro never runs `git init` or writes a manifest into a folder it did not create.
4. **Auto-open of the latest project stays.** If it fails the user lands in Welcome with a toast and the Recent list, not in the wizard.
5. **First run order**: privacy notice, then the early-access dialog, then the guided tour. The tour has a no-project variant that points at Welcome.
6. **The create wizard is unchanged** and is now an ordinary closable dialog.

## Consequences

- Backend guards that return "no project is open" are now reachable from the UI, so no new backend rules were needed. Project-scoped UI must be gated on `activeProject`.
- The block on tab creation relies on `projectStore.hasBootstrapped`, so tabs restored or opened before bootstrap are not affected.
- The free-tier project cap still applies to Open Project Folder when the folder is not yet registered; the backend error is shown as a toast.
- `ErrNotZentroProject` (backend) and the `not_a_project` code (frontend) are a contract: the error text must keep "not a zentro project".
