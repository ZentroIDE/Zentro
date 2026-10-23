---
trigger: always_on
---

# Release Rules

Automated by the `zentro-release` skill (workspace-root `.claude/skills/zentro-release/`).
This document is the fallback for doing it by hand and the reference for what the skill
does. The condensed contract is the `zentro-release-flow` skill
(`.claude/skills/17-release-flow/`).

Everything downstream of the `v*` git tag is already automated by
`.github/workflows/release.yml`. The manual half is: cut from `dev`, write the release
notes, verify, `npm run release`, push the tag. Then a small follow-up in
`zentro-landing` and `zentro-docs`.

---

# 1. Branch model

- `dev` is the integration branch. Feature branches off `dev`, PR into `dev`.
- `main` is the release branch. It advances **only** by:
  - `git merge --ff-only dev`, or
  - the `chore(release): X.Y.Z` commit that `npm run release` creates.
- Never commit feature work directly onto `main`.
- After a release ships, `main` is merged back into `dev`.

---

# 2. Version source of truth

`npm run release` (via `commit-and-tag-version`, config `.versionrc.cjs`) bumps three
files in lockstep:

- `package.json`
- `frontend/package.json`
- `wails.json` → `.info.productVersion` (custom updater `scripts/wails-version-updater.cjs`)

Never hand-edit those version fields. `release.yml` also re-syncs them from the tag at
build time, so a forgotten bump is self-healed for the build — but not for the release
notes.

`internal/app/app_about_facade.go` `var Version` is overwritten by `-ldflags` at build.
Not a source of truth; ignore the stale literal.

---

# 3. Release notes

One file per version: `release-notes/vX.Y.Z.md` (pre-release: `release-notes/vX.Y.Z-beta.md`).

Format:

```markdown
---
version: 0.7.0
date: 2026-09-10
channel: stable
highlights: One-line summary shown under the version heading
---

### Breaking Changes

- ... (omit the section entirely if there are none)

### New Features

- **Bold lead-in** — what the user gets

### Fixes & Polish

- ...
```

Allowed markup: `**bold**`, `` `code` ``, `[text](url)`, `###` headings, `-` bullets.
No nested lists, tables, or images.

- Scaffold: `npm run release-notes -- new 0.7.0`
- The `postbump` hook (`release-notes.mjs release-sync`) **aborts `npm run release`** if
  this file is missing or still a stub (empty highlights / no `###` sections / trivial
  prose).
- `CHANGELOG.md` is separate — the auto-generated internal commit log from
  `commit-and-tag-version`. Never hand-edit it. Release notes are the public story;
  `zentro-docs` renders them from the public repo's `release-notes/index.json`, which
  reaches it through the normal `sync-public-repo` snapshot (sync before or right after the tag).

---

# 4. Cutting the release

From the repo root, on a clean tree:

```
# 1. land the notes on dev
git checkout dev && git pull --ff-only
npm run release-notes -- new X.Y.Z          # then edit release-notes/vX.Y.Z.md
git add release-notes/vX.Y.Z.md
git commit -m "docs(release-notes): add vX.Y.Z notes"
git push origin dev

# 2. cut from main
git checkout main && git pull --ff-only
git merge --ff-only dev                      # STOP if not a fast-forward — do not force
npm run verify:push                          # must pass; never SKIP_PRE_PUSH_CHECKS
npm run release -- --release-as X.Y.Z        # bump + CHANGELOG + notes sync + commit + tag (local)

# 3. review, then the point of no return
git show --stat HEAD
git diff HEAD~1 HEAD -- CHANGELOG.md
npm run release-notes -- render X.Y.Z --heading
git push --follow-tags origin main           # <-- triggers release.yml
```

To undo a local `npm run release` before pushing:
`git tag -d vX.Y.Z && git reset --hard HEAD~1`.

Never add `Co-Authored-By`, `Generated with [Claude Code]`, or `Claude-Session:`
trailers — the `.githooks/commit-msg` hook blocks them.

---

# 5. What the tag triggers (`.github/workflows/release.yml`)

`on: push: tags: ['v*']`. Release assets live in the **public** repository `ZentroIDE/Zentro` (the `PUBLIC_REPO` env
at the top of `release.yml`; nothing is created in this private repo). Four jobs:

0. **prepare** — validates the release notes and creates a *draft* release in that repository
   with the rendered notes. Nothing is visible to users yet.

1. **build** — matrix Wails build for `windows/amd64`, `linux/amd64`, `darwin/universal`,
   plus a fourth row that builds `linux/amd64` again inside a `fedora:41` container
   (`-tags webkit2_41`, packaged as `.rpm` via [nfpm](https://github.com/goreleaser/nfpm),
   config at `build/linux/nfpm.yaml`) — a separate lane, not a repackage of the Ubuntu
   binary, because Fedora ships `webkit2gtk4.1` instead of the `webkit2gtk-4.0` the Ubuntu
   build links against. The `ubuntu-22.04` row's raw binary is only a build
   intermediate now (staged to `linux-stage/zentro-bin`, never published directly) — it
   feeds two published Linux artifacts: a `.deb` via the same `nfpm.yaml` (Ubuntu/Debian
   package-manager install, `libgtk-3-0`/`libwebkit2gtk-4.0-37` deps) and a
   distro-agnostic AppImage (`scripts/build-appimage.sh`, via `linuxdeploy` +
   `linuxdeploy-plugin-gtk`) that bundles its own GTK3/WebKit2GTK instead of relying on
   the host's — so the one AppImage runs on Fedora too, not just Ubuntu/Debian-family —
   with embedded `--updateinformation` and a `.zsync` sidecar so `appimageupdatetool`
   (bundled into the AppDir at build time, invoked by
   `internal/app/update_installer_linux.go`) can update it in place — the same
   silent-update deal Windows gets via its NSIS installer. (The `.deb`/`.rpm` installs
   don't self-update — they stay on the check-and-open-a-link flow and rely on the
   system package manager for upgrades.) The `macos-latest` row
   ad-hoc `codesign`s (identity `-`, no Developer ID cert — not purchased yet) the
   `.app` before packaging it two ways: the existing `.zip` (manual/portable fallback,
   `macos/universal-zip`) and a new `.pkg` built via `pkgbuild`
   (`build/darwin/scripts/postinstall`), the auto-updatable, recommended download
   (`macos/universal`, updated in place by `internal/app/update_installer_darwin.go`).
   Ad-hoc signing only fixes Apple Silicon's mandatory-code-signing requirement to
   execute at all — it does **not** satisfy Gatekeeper/notarization, so the `.pkg`
   still needs one manual right-click → Open the very first time; its `postinstall`
   script strips the quarantine flag from the installed app so every launch and
   silent update after that first install is unaffected. Getting a real Apple
   Developer ID + notarizing removes that one remaining step entirely — not done yet,
   no account. Windows binaries are code-signed via the SignPath REST API. Each build uploads
   its assets (8 in total) straight into the draft release with `gh release upload`.
2. **publish-public-release** — runs only when every build succeeded: checks all 8 assets are
   on the draft, and publishes it. A failed build therefore never leaves a half-published release.
3. **register-releases** — for each of 7 platform/arch rows
   (`windows/amd64`, `windows/amd64-portable`, `linux/amd64-deb`,
   `linux/amd64-rpm`, `linux/amd64-appimage`, `macos/universal`, `macos/universal-zip`):
   `POST {ZENTRO_API_URL}/api/v1/admin/releases` then `POST .../releases/{id}/publish`
   with `Authorization: Bearer {ZENTRO_ADMIN_SECRET}`. Channel is `stable`, or `beta`
   when the tag contains `-`. The `.AppImage.zsync` sidecar (8th asset) is not
   registered as its own row — it's delta-update metadata `appimageupdatetool` fetches
   directly from the public GitHub repo, not a user-facing download.

Watch: `gh run watch <id> --exit-status`. On failure: `gh run view <id> --log-failed`.

Verify when green:

```
curl -s "https://api.zentro-ide.com/api/v1/releases/latest-version?channel=stable"
curl -s "https://api.zentro-ide.com/api/v1/releases/latest?platform=windows&arch=amd64&channel=stable"
gh release view vX.Y.Z --repo ZentroIDE/Zentro
```

Then merge back: `git checkout dev && git merge main --no-edit && git push origin dev`.

---

# 6. Sibling repos (after the app CI has registered the release)

Each deploys on push to its own `master`.

- **zentro-landing** — bump `FALLBACK_VERSION` in `src/lib/version.ts` to `"vX.Y.Z"`,
  commit `chore: bump fallback version to vX.Y.Z`, push `master`. Cosmetic only: the
  displayed version comes from `zentro-api` via `getLatestVersion()` ISR and refreshes
  within an hour on its own.
- **zentro-docs** — the changelog page pulls
  `raw.githubusercontent.com/ZentroIDE/Zentro/main/release-notes/index.json` at
  build / ISR (`revalidate: 3600`), with `data/release-notes.json` as the committed
  fallback. Refresh that snapshot from the same URL and push `master`, or just
  `gh workflow run "Deploy Docs to VPS" --ref master` to force a rebuild. The static
  `## vX.Y.Z` blocks in `pages/changelog/index.mdx` are frozen at v0.5.2 and older —
  never add to them.
- **zentro-api** — no version bump, no redeploy for an app release.

---

# 7. Rollback / if CI fails

- **A single job failed, release not usable** — in `zentro-api`, unpublish each row:
  `GET /api/v1/admin/releases` to find the ids, then
  `POST /api/v1/admin/releases/{id}/unpublish` (Bearer admin secret). Delete the GitHub
  release (draft or published, in `ZentroIDE/Zentro`) and the tag
  (`git push origin :refs/tags/vX.Y.Z`; `git tag -d vX.Y.Z`).
- **Need to revert the version bump** — revert the `chore(release): X.Y.Z` commit on
  `main` (`git revert <sha>`), push, merge back to `dev`. Do not delete history on
  `main`.
- **Re-registering the same version is safe** — the API's `CreateRelease` upserts on
  `(version, platform, arch, channel)` and leaves publish state untouched.
