# Opening the public repository

How the open-core source goes public (ADR 0019, epic #124, checklist #139). The private repository
stays the source of truth; the public one is a snapshot with a **new history**, fed by
`scripts/sync-public-repo.mjs`. This file is the go-live runbook — nothing here has been run yet.

Names: the public repository takes the name `ZentroIDE/Zentro`. The private repository is renamed
first, to `ZentroIDE/zentro-internal` (name confirmed).

## Branches

The public repository has **`main` and release tags `v*` only**. Day-to-day work (`dev`, feature
branches) stays in the private repository. Community pull requests target `main` and are pulled
back into private `dev` with `scripts/pull-back-pr.mjs`; the next sync carries the result
out again.

Rules are kept as ruleset files in `.github/rulesets/` and applied with `gh api`:

| Ruleset | Applies to | What it enforces |
|---|---|---|
| `main.json` | default branch | no deletion, no force push, linear history, pull request required (1 approval, code-owner review, stale approvals dismissed, threads resolved, squash or rebase only), required status checks, branch up to date |
| `tags.json` | `v*` tags | only a repository admin can create, move or delete a release tag |

The repository admin role bypasses both rulesets. That is deliberate: the maintainer pushes sync
commits straight to `main`, and a sole maintainer cannot approve their own pull requests.

## Go-live steps

1. **Checklist #139 is green**: a release containing #126/#127 is out, gitleaks is clean,
   `npm run verify:push` passes, the emails and legal pages are final.
2. **Rename the private repository**, then fix every clone's remote *before* creating the public one
   (GitHub redirects the old name only until a new repository takes it):

   ```bash
   gh repo rename zentro-internal --repo ZentroIDE/Zentro
   git remote set-url origin https://github.com/ZentroIDE/zentro-internal.git   # in each clone
   ```

   Update the hard-coded references listed by `grep -rIl "ZentroIDE/Zentro" .` (docs, issue
   template config, `CLAUDE.md`) — the public README and issue-form links should keep pointing at
   the *public* name.
3. **Create the public repository** (empty, no template files):

   ```bash
   gh repo create ZentroIDE/Zentro --public --homepage https://zentro-ide.com \
     --description "A project-centric desktop SQL IDE. Open-source core (GPL-3.0)."
   git clone https://github.com/ZentroIDE/Zentro.git ../zentro-public
   git -C ../zentro-public config user.name "Alex Nguyen"
   git -C ../zentro-public config user.email "<address you are happy to publish>"
   node scripts/sync-public-repo.mjs --to ../zentro-public
   git -C ../zentro-public push -u origin main
   ```
4. **Repository settings**:

   ```bash
   gh repo edit ZentroIDE/Zentro --enable-issues --enable-discussions --enable-squash-merge \
     --enable-rebase-merge --enable-merge-commit=false --delete-branch-on-merge \
     --enable-wiki=false --enable-projects=false
   gh api -X PUT repos/ZentroIDE/Zentro/vulnerability-alerts
   gh api -X PUT repos/ZentroIDE/Zentro/automated-security-fixes
   gh api -X PUT repos/ZentroIDE/Zentro/private-vulnerability-reporting
   gh api -X PATCH repos/ZentroIDE/Zentro \
     -f 'security_and_analysis[secret_scanning][status]=enabled' \
     -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
   ```

   In the web UI: *Settings → Actions → General → Fork pull request workflows* — require approval for
   first-time contributors.
5. **Apply the rulesets** (after the first push, so the initial sync is not blocked):

   ```bash
   gh api -X POST repos/ZentroIDE/Zentro/rulesets --input .github/rulesets/tags.json
   gh api -X POST repos/ZentroIDE/Zentro/rulesets --input .github/rulesets/main.json
   ```

   A required status check that never reports blocks every pull request. The names in `main.json`
   (`build`, `secret-scan`, `backend-quality`, `frontend-quality`, `license-check`,
   `entitlement-matrix`) are the job names in `.github/workflows/`; open one test pull request and
   confirm each one reports before relying on the ruleset.
6. **Install the CLA Assistant bot** on the public repository, then confirm the `public-tree` CI job
   is green on the public tree.
7. **Announce**: the landing page's Community Edition link (`CE_REPO_URL`) and the README links now
   resolve; transfer the open issues from `zentro-window-issue-tracker` if that is still the plan.

## Docs repository

`ZentroIDE/zentro-docs` follows the same pattern (a one-commit snapshot of the private
`zentro-documentation`) with its own `main` ruleset (required check: `build`). The deploy workflow
and the nginx files stay in the private repository only.
